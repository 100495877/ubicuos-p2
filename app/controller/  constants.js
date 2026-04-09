// app/controller/constants.js

export const EVENTS = {
  // Controller → Server
  GESTO_SHAKE:            'gesto-shake',
  GESTO_DOUBLE_SHAKE:     'gesto-double-shake',

  // Server → Controller
  START_EXPENSE_CAPTURE:  'start_expense_capture',

  // Controller → Server → Display
  EXPENSE_CREATED:        'expense_created',
  NAVIGATE_LEFT:          'navigate_left',
  NAVIGATE_RIGHT:         'navigate_right',
  MARK_LIKE:              'mark_like',
  MARK_DISLIKE:           'mark_dislike',
  CONFIRM:                'confirm',
  CANCEL:                 'cancel',
  TOGGLE_CASH:            'toggle_cash',
};

// ── Umbrales de movimiento ──────────────────────────────────────────────────

// Acelerómetro (shake)
export const SHAKE_THRESHOLD    = 18;   // m/s² magnitud total
export const SHAKE_COOLDOWN_MS  = 1200; // tiempo mínimo entre shakes

// Doble shake (toggle cash): 2 shakes en menos de DOUBLE_SHAKE_WINDOW_MS
export const DOUBLE_SHAKE_WINDOW_MS = 700;

// Orientación (tilt) – DeviceOrientationEvent
export const TILT_LR_THRESHOLD  = 30;  // grados gamma (izq/dcha) → navegar
export const TILT_FB_THRESHOLD  = 40;  // grados beta  (adelante)  → confirmar
export const TILT_BACK_THRESHOLD = -30; // grados beta  (atrás)     → cancelar
export const TILT_COOLDOWN_MS   = 800;

// Inclinación fuerte para like/dislike en modo Tinder
export const TILT_LIKE_THRESHOLD    = 50;  // gamma > +50 → LIKE
export const TILT_DISLIKE_THRESHOLD = -50; // gamma < -50 → DISLIKE