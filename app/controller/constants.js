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

// ── Umbrales de movimiento ──────────────────────────────────────────────────

// Acelerómetro (shake)
export const SHAKE_THRESHOLD    = 18;   // m/s² magnitud total
export const SHAKE_COOLDOWN_MS  = 1200; // tiempo mínimo entre shakes

// Orientación (tilt) – DeviceOrientationEvent
export const TILT_LR_THRESHOLD   = 30;  // grados gamma (izq/dcha)
export const TILT_FB_THRESHOLD   = 40;  // grados beta  (adelante)
export const TILT_BACK_THRESHOLD = -30; // grados beta  (atrás)
export const TILT_COOLDOWN_MS    = 1500;
