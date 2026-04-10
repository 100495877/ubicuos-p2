// app/controller/voice.js
// Captura voz con Web Speech API y parsea comandos de gasto en español.
// La conversión de palabras numéricas a cifras está integrada — sin librerías externas.

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

// Consume tokens numéricos desde el inicio del array.
// Regla clave: si después de una unidad simple (1-9) aparece una decena sin "y",
// se para — evita fusionar "dos cincuenta" en 52.
function wordsToNumber(tokens) {
  let total = 0, current = 0, i = 0;
  let lastWasSimpleUnit = false;

  while (i < tokens.length) {
    const t = tokens[i];

    if (t === 'mil') {
      current = current === 0 ? 1 : current;
      total  += current * 1000;
      current = 0; lastWasSimpleUnit = false; i++; continue;
    }
    if (t === 'y') { lastWasSimpleUnit = false; i++; continue; }

    if (CENTENAS[t] !== undefined) {
      if (lastWasSimpleUnit) break;
      current += CENTENAS[t]; lastWasSimpleUnit = false; i++; continue;
    }
    if (DECENAS[t] !== undefined) {
      if (lastWasSimpleUnit) break; // "dos cincuenta" → para tras "dos"
      current += DECENAS[t]; lastWasSimpleUnit = false; i++; continue;
    }
    if (UNIDADES[t] !== undefined) {
      if (lastWasSimpleUnit) break;
      const v = UNIDADES[t];
      current += v;
      lastWasSimpleUnit = v >= 1 && v <= 9; // solo unidades puras, no diez/once...
      i++; continue;
    }
    break;
  }

  return { value: total + current, consumed: i };
}

// Recorre el texto token a token y reemplaza secuencias de palabras numéricas
// por su equivalente en cifras. Detecta decimales con "con / coma / punto".
// Ejemplos:
//   "café dos con cincuenta"              → "café 2.50"
//   "supermercado treinta y cuatro euros" → "supermercado 34 euros"
//   "farmacia doce con cincuenta"         → "farmacia 12.50"
//   "gasolina mil doscientos"             → "gasolina 1200"
//   "setenta y cinco con veinte"          → "75.20"
function wordsToDigits(text) {
  const DECIMAL_SEP = /^(con|coma|punto)$/;
  const tokens = text.split(/\s+/);
  const out = [];
  let i = 0;

  while (i < tokens.length) {
    const ft = tokens[i].toLowerCase();
    const startsNumber =
      UNIDADES[ft] !== undefined ||
      DECENAS[ft]  !== undefined ||
      CENTENAS[ft] !== undefined ||
      ft === 'mil';

    if (startsNumber) {
      const { value: intPart, consumed: c1 } =
        wordsToNumber(tokens.slice(i).map(t => t.toLowerCase()));
      i += c1;

      let fullNumber = String(intPart);

      // ¿Sigue separador decimal + más palabras numéricas?
      if (i < tokens.length && DECIMAL_SEP.test(tokens[i].toLowerCase())) {
        i++; // saltar "con/coma/punto"
        const { value: decPart, consumed: c2 } =
          wordsToNumber(tokens.slice(i).map(t => t.toLowerCase()));
        if (c2 > 0) {
          const decStr = decPart < 10 ? '0' + decPart : String(decPart);
          fullNumber = intPart + '.' + decStr;
          i += c2;
        }
      }

      out.push(fullNumber);
    } else {
      out.push(tokens[i]);
      i++;
    }
  }

  return out.join(' ');
}

// ── Parsear texto de voz → objeto gasto ──────────────────────────────────────
// Acepta dígitos directos ("café 2.50") o palabras ("café dos con cincuenta").
export function parseExpenseText(rawText) {
  // 1. Convertir palabras numéricas a cifras
  const converted = wordsToDigits(rawText.trim().toLowerCase());
  console.log(`[Voice] "${rawText}" → "${converted}"`);

  // 2. Detectar método de pago
  const cash = /\b(efectivo|cash|en efectivo|metálico)\b/.test(converted);

  // 3. Extraer precio (último número del texto)
  const priceMatches = converted.match(/(\d+[.,]\d{1,2}|\d+)\s*(euros?|€|eur)?/g);
  if (!priceMatches || priceMatches.length === 0) return null;

  const rawPrice = priceMatches[priceMatches.length - 1]
    .replace(/euros?|€|eur/g, '').trim().replace(',', '.');
  const price = parseFloat(rawPrice);
  if (isNaN(price) || price <= 0) return null;

  // 4. Nombre del producto: lo que queda antes del precio
  const withoutPayment = converted
    .replace(/\b(efectivo|cash|en efectivo|metálico|tarjeta|con tarjeta)\b/g, '')
    .trim();
  const productRaw = withoutPayment
    .replace(/\s*(\d+[.,]\d{1,2}|\d+)\s*(euros?|€|eur)?\s*$/, '')
    .trim();
  const product = productRaw
    ? productRaw.charAt(0).toUpperCase() + productRaw.slice(1)
    : 'Gasto';

  return { product, price, cash, location: '', like: null };
}

// ── Iniciar escucha ───────────────────────────────────────────────────────────
export function startListening(onResult, onError) {
  if (listening) {
    console.warn('[Voice] Ya está escuchando');
    return;
  }

  recognition = createRecognition();

  if (!recognition) {
    // Fallback: prompt() en escritorio
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

  recognition.onresult = (event) => {
    listening = false;
    // Probar cada alternativa hasta encontrar una parseable
    for (let alt = 0; alt < event.results[0].length; alt++) {
      const transcript = event.results[0][alt].transcript;
      console.log(`[Voice] Alt ${alt}: "${transcript}"`);
      const gasto = parseExpenseText(transcript);
      if (gasto) {
        vibrateSuccess();
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
    // 'no-speech' y 'aborted' son esperables y no constituyen errores reales
    if (event.error === 'no-speech' || event.error === 'aborted') {
      setStatus('⚠️ No se detectó voz — sacude para reintentar');
      return;
    }
    vibrateLong();
    setStatus(`❌ Error de voz: ${event.error}`);
    console.error('[Voice] Error:', event.error);
    onError(event.error);
  };

  recognition.onend = () => { listening = false; };

  try {
    recognition.start();
  } catch (e) {
    listening = false;
    console.error('[Voice] No se pudo iniciar:', e);
    onError(e.message);
  }
}

export function stopListening() {
  if (recognition && listening) {
    recognition.stop();
    listening = false;
  }
}