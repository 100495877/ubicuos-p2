// app/controller/feedback.js

export function vibrateShort()   { if ('vibrate' in navigator) navigator.vibrate(80); }
export function vibrateDouble()  { if ('vibrate' in navigator) navigator.vibrate([80, 60, 80]); }
export function vibrateSuccess() { if ('vibrate' in navigator) navigator.vibrate([60, 40, 60, 40, 120]); }
export function vibrateLong()    { if ('vibrate' in navigator) navigator.vibrate(300); }

/** Texto de estado principal */
export function setStatus(msg) {
  const el = document.getElementById('status');
  if (el) el.textContent = msg;
}

/** Subtítulo de modo actual */
export function setMode(msg) {
  const el = document.getElementById('mode');
  if (el) el.textContent = msg;
}

/** Indicador persistente de método de pago por defecto */
export function setCash(isCash) {
  const el = document.getElementById('cash-indicator');
  if (!el) return;
  el.textContent  = isCash ? '💵 Efectivo' : '💳 Tarjeta';
  el.className    = 'cash-badge ' + (isCash ? 'cash-cash' : 'cash-card');
}
