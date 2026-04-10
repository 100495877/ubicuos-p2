// app/controller/voice.js
// Captura voz con Web Speech API y parsea comandos tipo "café 2.50 efectivo"
// Modelo de gasto: { product, price, location, cash, like }

import { vibrateDouble, vibrateSuccess, vibrateLong, setStatus } from './feedback.js';
//const { GetNumberFromWord } = require('spanish-word-to-number');
//const { toWords } = require('to-words');

let recognition = null;
let listening    = false;

// ── Crear instancia ───────────────────────────────────────────────────────────
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

// ── Traducir numeros con letras a numeros con digitos ─────────────────────────
function numberLetterToDigit(text) {
  text.replace(/\b\d+\b/g, (coincidencia) => { return toWords(parseInt(coincidencia), {localeCode: "es-ES"})});
  for (var i = 0; i < text.length; i++) {
    for (var j = text.length; j > i; j--) {
      var substring = text.substring(i, j);
      var digits = GetNumberFromWord(substring, {includeThousands: true})
      if (digits["result"] == "No se encontró el número") {
        continue;
      } else {
        text = text.replace(substring, digits["result"].toString());
        return numberLetterToDigit(text);
      }
    }
  }
  return text;
}

// ── Parsear texto de voz → objeto gasto ──────────────────────────────────────
// Ejemplos: "café 2.5" | "supermercado 34,90 efectivo" | "gasolina 50 tarjeta"
export function parseExpenseText(text) {
  const clean = text.trim().toLowerCase();

  clean = numberLetterToDigit(clean);

  const cash = /\b(efectivo|cash|en efectivo|metálico)\b/.test(clean);

  const priceMatches = clean.match(/(\d+[.,]\d{1,2}|\d+)\s*(euros?|€|eur)?/g);
  if (!priceMatches || priceMatches.length === 0) return null;

  const rawPrice = priceMatches[priceMatches.length - 1]
    .replace(/euros?|€|eur/g, '').trim().replace(',', '.');
  const price = parseFloat(rawPrice);
  if (isNaN(price) || price <= 0) return null;

  const withoutPayment = clean
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
// onResult(gasto)  → se reconoció y parseó correctamente
// onError(reason)  → fallo real del reconocedor (red, permiso, etc.)
//
// IMPORTANTE: cuando se reconoce texto pero no se puede parsear como gasto,
// se muestra feedback al usuario pero NO se llama a onError.
// Esto evita que el servidor reciba EXPENSE_CREATED(null).
export function startListening(onResult, onError) {
  if (listening) {
    console.warn('[Voice] Ya está escuchando');
    return;
  }

  recognition = createRecognition();

  if (!recognition) {
    // Fallback: prompt() para debug en escritorio
    const input = prompt('🎤 Voz simulada (ej: "café 2.50 efectivo"):');
    if (input) {
      const gasto = parseExpenseText(input);
      if (gasto) {
        onResult(gasto);
      } else {
        setStatus('⚠️ No se entendió');
        // Parse fail: NO llamamos onError → el servidor no recibe null
      }
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

    // Texto reconocido pero no parseable: feedback silencioso, sin propagar error
    vibrateLong();
    setStatus('⚠️ No se entendió — sacude de nuevo para reintentar');
    console.warn('[Voice] Ninguna alternativa parseable');
  };

  // Solo errores reales del reconocedor llegan a onError
  recognition.onerror = (event) => {
    listening = false;
    if (event.error === 'no-speech') {
      // No habló: tratarlo igual que parse fail, sin propagar
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
