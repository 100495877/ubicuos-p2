// app/controller/voice.js
// Captura voz con Web Speech API y parsea comandos tipo "café 2.50 efectivo"
// Modelo de gasto: { product, price, location, cash, like }

import { EVENTS } from './constants.js';
import { vibrateDouble, vibrateSuccess, vibrateLong, setStatus } from './feedback.js';

let recognition = null;
let listening    = false;

// ── Crear instancia de reconocimiento ─────────────────────────────────────────
function createRecognition() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.warn('[Voice] Web Speech API no disponible en este navegador.');
    return null;
  }

  const r = new SpeechRecognition();
  r.lang           = 'es-ES';
  r.continuous     = false;
  r.interimResults = false;
  r.maxAlternatives = 3;
  return r;
}

// ── Parsear texto de voz en objeto gasto ─────────────────────────────────────
// Ejemplos válidos:
//   "café 2.5"
//   "supermercado 34,90 efectivo"
//   "gasolina 50 euros tarjeta"
//   "farmacia 12.50"
export function parseExpenseText(text) {
  const clean = text.trim().toLowerCase()
    .replace(/\bcon\b/g, '')          // "con tarjeta" → "tarjeta"
    .replace(/\bpunto\b/g, '.')       // "dos punto cinco" → "dos.cinco"  
    .replace(/\bcoma\b/g, '.')        // "dos coma cinco" → "dos.cinco"
    .replace(/\beuros?\b|€|eur\b/g, '');

  const cash = /\b(efectivo|cash|en efectivo|metálico)\b/.test(clean);

  // Buscar primero decimales explícitos (2.50, 2,50)
  let priceMatch = clean.match(/\b(\d+[.,]\d{1,2})\b/);
  let price;

  if (priceMatch) {
    price = parseFloat(priceMatch[1].replace(',', '.'));
  } else {
    // Buscar dos números consecutivos separados por espacio → fusionar como decimal
    // Ej: "cafe 2 50" → 2.50
    const twoNums = clean.match(/(\d+)\s+(\d{1,2})(?:\s|$)/);
    if (twoNums) {
      price = parseFloat(`${twoNums[1]}.${twoNums[2]}`);
    } else {
      // Un solo número entero
      const single = clean.match(/\b(\d+)\b/g);
      if (!single) return null;
      price = parseFloat(single[single.length - 1]);
    }
  }

  if (isNaN(price) || price <= 0) return null;

  // Quitar el precio y palabras de pago para extraer el producto
  const withoutPayment = clean
    .replace(/\b(efectivo|cash|en efectivo|metálico|tarjeta|con tarjeta)\b/g, '')
    .trim();

  const pricePattern = /\s*\d+[.,]?\d*\s*\d*\s*$/;
  const productRaw = withoutPayment.replace(pricePattern, '').trim();
  const product = productRaw.charAt(0).toUpperCase() + productRaw.slice(1) || 'Gasto';

  return { product, price, cash, location: '', like: null };
}

// ── Iniciar escucha ───────────────────────────────────────────────────────────
export function startListening(socket, onResult, onError) {
  if (listening) {
    console.warn('[Voice] Ya está escuchando');
    return;
  }

  recognition = createRecognition();

  if (!recognition) {
    // Fallback: simular con prompt() para debug en desktop
    const input = prompt('🎤 Voz simulada (ej: "café 2.50 efectivo"):');
    if (input) {
      const gasto = parseExpenseText(input);
      if (gasto) { onResult(gasto); } else { onError('No se entendió el gasto'); }
    } else {
      onError('Cancelado');
    }
    return;
  }

  listening = true;
  setStatus('🎤 Escuchando...');
  vibrateDouble();

  recognition.onstart = () => {
    console.log('[Voice] Escucha iniciada');
  };

  recognition.onresult = (event) => {
    listening = false;
    let bestResult = null;

    // Intentar todas las alternativas hasta encontrar una válida
    for (let alt = 0; alt < event.results[0].length; alt++) {
      const transcript = event.results[0][alt].transcript;
      console.log(`[Voice] Alternativa ${alt}: "${transcript}"`);
      const parsed = parseExpenseText(transcript);
      if (parsed) {
        bestResult = parsed;
        break;
      }
    }

    if (bestResult) {
      console.log('[Voice] Gasto parseado:', bestResult);
      vibrateSuccess();
      setStatus(`✅ "${bestResult.product}" ${bestResult.price}€`);
      onResult(bestResult);
    } else {
      vibrateLong();
      setStatus('⚠️ No entendido, intenta de nuevo');
      onError('No se pudo parsear el gasto');
    }
  };

  recognition.onerror = (event) => {
    listening = false;
    console.error('[Voice] Error:', event.error);
    vibrateLong();
    setStatus(`❌ Error de voz: ${event.error}`);
    onError(event.error);
  };

  recognition.onend = () => {
    listening = false;
    console.log('[Voice] Escucha finalizada');
  };

  try {
    recognition.start();
  } catch (e) {
    listening = false;
    console.error('[Voice] No se pudo iniciar reconocimiento:', e);
    onError(e.message);
  }
}

export function stopListening() {
  if (recognition && listening) {
    recognition.stop();
    listening = false;
  }
}