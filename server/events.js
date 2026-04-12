// server/events.js
const EVENTS = {
  // Controller → Server
  GESTO_SHAKE:            'gesto-shake',
  ENTER_TINDER:           'enter_tinder',
  REPEAT_CAPTURE:         'repeat_capture',
  ENTER_BUDGET:           'enter_budget',    // tilt atrás en idle → modo tope
  SET_BUDGET:             'set_budget',      // enviar cantidad del tope
  EDIT_BUDGET:            'edit_budget',     // tilt lateral en budget → editar

  // Server → Controller
  START_EXPENSE_CAPTURE:  'start_expense_capture',
  START_BUDGET_CAPTURE:   'start_budget_capture',  // pedir voz para el tope

  // Controller → Server → Display
  EXPENSE_CREATED:        'expense_created',
  MARK_LIKE:              'mark_like',
  MARK_DISLIKE:           'mark_dislike',
  CONFIRM:                'confirm',
  CANCEL:                 'cancel',
  TOGGLE_CASH:            'toggle_cash',

  // Server → todos
  STATE_UPDATE:           'state_update',
  BUDGET_ALERT:           'budget_alert',    // aviso al superar 50/75/100%
};

module.exports = EVENTS;
