// server/events.js
// Nombres de eventos canónicos compartidos por server y display.
// El controller los importa desde su propio constants.js (ESM).

const EVENTS = {
  // --- Controller → Server ---
  GESTO_SHAKE:            "gesto-shake",          // sacudida → inicia captura
  GESTO_DOUBLE_SHAKE:     "gesto-double-shake",   // doble sacudida → toggle efectivo

  // --- Server → Controller ---
  START_EXPENSE_CAPTURE:  "start_expense_capture",

  // --- Controller → Server → Display ---
  EXPENSE_CREATED:        "expense_created",
  NAVIGATE_LEFT:          "navigate_left",
  NAVIGATE_RIGHT:         "navigate_right",
  MARK_LIKE:              "mark_like",
  MARK_DISLIKE:           "mark_dislike",
  CONFIRM:                "confirm",
  CANCEL:                 "cancel",
  TOGGLE_CASH:            "toggle_cash",

  // --- Server → Display (estado global) ---
  STATE_UPDATE:           "state_update",
};

module.exports = EVENTS;