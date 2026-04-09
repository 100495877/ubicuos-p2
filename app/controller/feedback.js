// app/controller/feedback.js

/** Un pulso corto: confirmación de gesto detectado */
export function vibrateShort() {
  if ('vibrate' in navigator) navigator.vibrate(80);
}

/** Doble pulso: captura de voz iniciada */
export function vibrateDouble() {
  if ('vibrate' in navigator) navigator.vibrate([80, 60, 80]);
}

/** Triple pulso rápido: confirmación de gasto guardado */
export function vibrateSuccess() {
  if ('vibrate' in navigator) navigator.vibrate([60, 40, 60, 40, 120]);
}

/** Un pulso largo: cancelación o error */
export function vibrateLong() {
  if ('vibrate' in navigator) navigator.vibrate(300);
}

/** Actualiza el texto de estado visible en la página del controller */
export function setStatus(msg) {
  const el = document.getElementById('status');
  if (el) el.textContent = msg;
}

/** Actualiza el subtítulo de estado (modo actual) */
export function setMode(msg) {
  const el = document.getElementById('mode');
  if (el) el.textContent = msg;
}