// app/controller/voice.js
// Captura voz con Web Speech API y parsea comandos de gasto en español.
// Geolocalización: captura las coordenadas y la dirección al crear cada gasto.

import { vibrateDouble, vibrateSuccess, vibrateLong, setStatus } from './feedback.js';

let recognition = null;
let listening    = false;

// ── Crear instancia de reconocimiento ────────────────────────────────────────
function createRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;
  const r = new SpeechRecognition();
  r.lang            = 'es-ES';
  r.continuous      = false;
  r.interimResults  = false;
  r.maxAlternatives = 3;
  return r;
}

// ── Geolocalización ───────────────────────────────────────────────────────────
// Devuelve una promesa con { lat, lon, address } o null si no disponible/denegado.
async function getLocation() {
  if (!navigator.geolocation) return null;
  try {
    const pos = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        timeout: 5000,
        maximumAge: 30000,
        enableHighAccuracy: false,
      })
    );
    const { latitude: lat, longitude: lon } = pos.coords;

    // Reverse geocoding con Nominatim (OpenStreetMap, sin API key)
    let address = null;
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=17&addressdetails=1`;
      const res  = await fetch(url, { headers: { 'Accept-Language': 'es' } });
      if (res.ok) {
        const data = await res.json();
        // Intentamos construir un string corto y legible: calle + ciudad
        const a = data.address || {};
        const parts = [
          a.road || a.pedestrian || a.footway || a.path,
          a.house_number,
          a.city || a.town || a.village || a.municipality,
        ].filter(Boolean);
        address = parts.join(' ') || data.display_name?.split(',')[0] || null;
      }
    } catch (_) { /* sin conexión o límite de Nominatim: dejamos address null */ }

    return { lat, lon, address };
  } catch (_) {
    return null; // permiso denegado o timeout
  }
}

// ── Diccionarios de palabras numéricas ───────────────────────────────────────
const UNIDADES = {
  cero:0, un:1, uno:1, una:1, dos:2, tres:3, cuatro:4, cinco:5,
  seis:6, siete:7, ocho:8, nueve:9, diez:10, once:11, doce:12,
  trece:13, catorce:14, quince:15, 'dieciséis':16, dieciseis:16,
  diecisiete:17, dieciocho:18, diecinueve:19, veinte:20,
  'veintiún':21, veintiuno:21, 'veintidós':22, veintidos:22,
  'veintitrés':23, veintitres:23, veinticuatro:24, veinticinco:25,
  'veintiséis':26, veintiseis:26, veintisiete:27, veintiocho:28, veintinueve:29,
};
const DECENAS = {
  treinta:30, cuarenta:40, cincuenta:50, sesenta:60,
  setenta:70, ochenta:80, noventa:90,
};
const CENTENAS = {
  cien:100, ciento:100,
  doscientos:200, doscientas:200, trescientos:300, trescientas:300,
  cuatrocientos:400, cuatrocientas:400, quinientos:500, quinientas:500,
  seiscientos:600, seiscientas:600, setecientos:700, setecientas:700,
  ochocientos:800, ochocientas:800, novecientos:900, novecientas:900,
};

function wordsToNumber(tokens) {
  let total = 0, current = 0, i = 0;
  let lastWasSimpleUnit = false;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t === 'mil') {
      current = current === 0 ? 1 : current;
      total  += current * 1000; current = 0; lastWasSimpleUnit = false; i++; continue;
    }
    if (t === 'y') { lastWasSimpleUnit = false; i++; continue; }
    if (CENTENAS[t] !== undefined) {
      if (lastWasSimpleUnit) break;
      current += CENTENAS[t]; lastWasSimpleUnit = false; i++; continue;
    }
    if (DECENAS[t] !== undefined) {
      if (lastWasSimpleUnit) break;
      current += DECENAS[t]; lastWasSimpleUnit = false; i++; continue;
    }
    if (UNIDADES[t] !== undefined) {
      if (lastWasSimpleUnit) break;
      const v = UNIDADES[t]; current += v;
      lastWasSimpleUnit = v >= 1 && v <= 9; i++; continue;
    }
    break;
  }
  return { value: total + current, consumed: i };
}

function wordsToDigits(text) {
  const DECIMAL_SEP = /^(con|coma|punto)$/;
  const tokens = text.split(/\s+/);
  const out = []; let i = 0;
  while (i < tokens.length) {
    const ft = tokens[i].toLowerCase();
    const startsNumber =
      UNIDADES[ft] !== undefined || DECENAS[ft] !== undefined ||
      CENTENAS[ft] !== undefined || ft === 'mil';
    if (startsNumber) {
      const { value: intPart, consumed: c1 } = wordsToNumber(tokens.slice(i).map(t => t.toLowerCase()));
      i += c1;
      let fullNumber = String(intPart);
      if (i < tokens.length && DECIMAL_SEP.test(tokens[i].toLowerCase())) {
        i++;
        const { value: decPart, consumed: c2 } = wordsToNumber(tokens.slice(i).map(t => t.toLowerCase()));
        if (c2 > 0) {
          const decStr = decPart < 10 ? '0' + decPart : String(decPart);
          fullNumber = intPart + '.' + decStr; i += c2;
        }
      }
      out.push(fullNumber);
    } else { out.push(tokens[i]); i++; }
  }
  return out.join(' ');
}

// ── Parsear texto de voz → objeto gasto ──────────────────────────────────────
export function parseExpenseText(rawText) {
  const converted = wordsToDigits(rawText.trim().toLowerCase());
  console.log(`[Voice] "${rawText}" → "${converted}"`);
  const cash = /\b(efectivo|cash|en efectivo|metálico)\b/.test(converted);
  const priceMatches = converted.match(/(\d+[.,]\d{1,2}|\d+)\s*(euros?|€|eur)?/g);
  if (!priceMatches || priceMatches.length === 0) return null;
  const rawPrice = priceMatches[priceMatches.length - 1]
    .replace(/euros?|€|eur/g, '').trim().replace(',', '.');
  const price = parseFloat(rawPrice);
  if (isNaN(price) || price <= 0) return null;
  const withoutPayment = converted
    .replace(/\b(efectivo|cash|en efectivo|metálico|tarjeta|con tarjeta)\b/g, '').trim();
  const productRaw = withoutPayment
    .replace(/\s*(\d+[.,]\d{1,2}|\d+)\s*(euros?|€|eur)?\s*$/, '').trim();
  const product = productRaw
    ? productRaw.charAt(0).toUpperCase() + productRaw.slice(1)
    : 'Gasto';
  return { product, price, cash, location: '', like: null };
}

// ── Parsear solo una cantidad numérica (para el tope de gasto) ───────────────
export function parseAmountText(rawText) {
  const converted = wordsToDigits(rawText.trim().toLowerCase());
  const matches = converted.match(/(\d+[.,]\d{1,2}|\d+)/g);
  if (!matches) return null;
  const val = parseFloat(matches[matches.length - 1].replace(',', '.'));
  return isNaN(val) || val <= 0 ? null : val;
}

// ── Iniciar escucha de gasto (con geolocalización en paralelo) ───────────────
export function startListening(onResult, onError) {
  if (listening) { console.warn('[Voice] Ya está escuchando'); return; }

  recognition = createRecognition();

  if (!recognition) {
    const input = prompt('🎤 Voz simulada (ej: "café 2.50 efectivo"):');
    if (input) {
      const gasto = parseExpenseText(input);
      if (gasto) { onResult(gasto); }
      else        { setStatus('⚠️ No se entendió — sacude para reintentar'); }
    }
    return;
  }

  listening = true;
  setStatus('🎤 Escuchando…');
  vibrateDouble();

  // Lanzar geolocalización en paralelo para no bloquear
  const locationPromise = getLocation();

  recognition.onresult = async (event) => {
    listening = false;
    for (let alt = 0; alt < event.results[0].length; alt++) {
      const transcript = event.results[0][alt].transcript;
      console.log(`[Voice] Alt ${alt}: "${transcript}"`);
      const gasto = parseExpenseText(transcript);
      if (gasto) {
        vibrateSuccess();
        setStatus(`✅ "${gasto.product}" ${gasto.price}€\nObteniendo ubicación…`);
        // Esperar la geolocalización (ya estaba en curso, debería ser rápida)
        const loc = await locationPromise;
        if (loc) {
          gasto.location = loc.address || `${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}`;
          gasto.lat = loc.lat;
          gasto.lon = loc.lon;
        }
        setStatus(`✅ "${gasto.product}" ${gasto.price}€`);
        onResult(gasto);
        return;
      }
    }
    vibrateLong();
    setStatus('⚠️ No se entendió — sacude de nuevo para reintentar');
    console.warn('[Voice] Ninguna alternativa parseable');
  };

  recognition.onerror = (event) => {
    listening = false;
    if (event.error === 'no-speech' || event.error === 'aborted') {
      setStatus('⚠️ No se detectó voz — sacude para reintentar'); return;
    }
    vibrateLong();
    setStatus(`❌ Error de voz: ${event.error}`);
    console.error('[Voice] Error:', event.error);
    onError(event.error);
  };

  recognition.onend = () => { listening = false; };

  try { recognition.start(); }
  catch (e) { listening = false; console.error('[Voice] No se pudo iniciar:', e); onError(e.message); }
}

// ── Escucha simple de cantidad (para el tope de gasto) ───────────────────────
export function startListeningAmount(onResult, onError) {
  if (listening) { console.warn('[Voice] Ya está escuchando'); return; }

  recognition = createRecognition();

  if (!recognition) {
    const input = prompt('🎤 Di una cantidad (ej: "200 euros"):');
    if (input) {
      const amount = parseAmountText(input);
      if (amount) { onResult(amount); }
      else         { setStatus('⚠️ No se entendió la cantidad'); onError('parse'); }
    }
    return;
  }

  listening = true;
  setStatus('🎤 Di la cantidad límite…');
  vibrateDouble();

  recognition.onresult = (event) => {
    listening = false;
    for (let alt = 0; alt < event.results[0].length; alt++) {
      const transcript = event.results[0][alt].transcript;
      console.log(`[Voice/Amount] Alt ${alt}: "${transcript}"`);
      const amount = parseAmountText(transcript);
      if (amount) {
        vibrateSuccess();
        setStatus(`✅ Tope fijado: ${amount}€`);
        onResult(amount);
        return;
      }
    }
    vibrateLong();
    setStatus('⚠️ No se entendió la cantidad');
    onError('parse');
  };

  recognition.onerror = (event) => {
    listening = false;
    if (event.error === 'no-speech' || event.error === 'aborted') {
      setStatus('⚠️ No se detectó voz'); return;
    }
    vibrateLong(); onError(event.error);
  };

  recognition.onend = () => { listening = false; };

  try { recognition.start(); }
  catch (e) { listening = false; onError(e.message); }
}

export function stopListening() {
  if (recognition && listening) { recognition.stop(); listening = false; }
}
