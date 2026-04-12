// app/controller/constants.js

export const EVENTS = {
  // Controller → Server
  GESTO_SHAKE:            'gesto-shake',
  ENTER_TINDER:           'enter_tinder',
  REPEAT_CAPTURE:         'repeat_capture',
  ENTER_BUDGET:           'enter_budget',
  SET_BUDGET:             'set_budget',
  EDIT_BUDGET:            'edit_budget',

  // Server → Controller
  START_EXPENSE_CAPTURE:  'start_expense_capture',
  START_BUDGET_CAPTURE:   'start_budget_capture',

  // Controller → Server → Display
  EXPENSE_CREATED:        'expense_created',
  MARK_LIKE:              'mark_like',
  MARK_DISLIKE:           'mark_dislike',
  CONFIRM:                'confirm',
  CANCEL:                 'cancel',
  TOGGLE_CASH:            'toggle_cash',

  // Server → todos
  STATE_UPDATE:           'state_update',
  BUDGET_ALERT:           'budget_alert',
};

// ── Shake ─────────────────────────────────────────────────────────────────────
export const SHAKE_THRESHOLD   = 18;
export const SHAKE_COOLDOWN_MS = 1200;

// ── Calibración ───────────────────────────────────────────────────────────────
export const CALIBRATION_SAMPLES = 30;

// ── Tilt — umbrales RELATIVOS post-calibración ────────────────────────────────
export const TILT_FB_THRESHOLD   = 35;
export const TILT_BACK_THRESHOLD = 40;
export const TILT_LR_THRESHOLD   = 45;
export const TILT_DEADZONE       = 8;
export const TILT_COOLDOWN_MS    = 1200;
