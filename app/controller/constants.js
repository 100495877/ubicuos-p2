// app/controller/constants.js

export const EVENTS = {
  // Controller → Server
  GESTO_SHAKE:            'gesto-shake',

  // Server → Controller
  START_EXPENSE_CAPTURE:  'start_expense_capture',

  // Controller → Server
  EXPENSE_CREATED:        'expense_created',
  MARK_LIKE:              'mark_like',
  MARK_DISLIKE:           'mark_dislike',
  CONFIRM:                'confirm',
  CANCEL:                 'cancel',
  TOGGLE_CASH:            'toggle_cash',
  ENTER_TINDER:           'enter_tinder',
  REPEAT_CAPTURE:         'repeat_capture',
};

// ── Shake ─────────────────────────────────────────────────────────────────────
export const SHAKE_THRESHOLD   = 18;    // m/s² magnitud total
export const SHAKE_COOLDOWN_MS = 1200;  // ms mínimo entre shakes

// ── Calibración ───────────────────────────────────────────────────────────────
// Número de muestras de DeviceOrientationEvent para calcular el offset inicial.
// A ~10 eventos/s → 30 muestras ≈ 3 segundos de calibración.
export const CALIBRATION_SAMPLES = 30;

// ── Tilt — umbrales RELATIVOS (desviación desde posición de reposo) ───────────
// Estos valores son desviaciones en grados desde el punto cero calibrado,
// NO ángulos absolutos. Ajústalos si los gestos resultan demasiado sensibles
// o insensibles para tu caso de uso.

export const TILT_FB_THRESHOLD   = 35;  // °β hacia adelante para CONFIRM/ENTER_TINDER
export const TILT_BACK_THRESHOLD = 40;  // °β hacia atrás   para CANCEL (positivo, se niega en código)
export const TILT_LR_THRESHOLD   = 45;  // °γ izq o dcha    para LIKE/DISLIKE/TOGGLE_CASH

// Zona muerta central: ignorar pequeñas vibraciones o temblores de mano.
// Gestos solo se procesan cuando beta o gamma supera este valor relativo.
export const TILT_DEADZONE       = 8;   // °, cualquier eje

// Tiempo mínimo entre dos gestos de tilt consecutivos.
export const TILT_COOLDOWN_MS    = 1200;