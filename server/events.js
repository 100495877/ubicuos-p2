// server/events.js
const EVENTS = {
  // Controller → Server
  GESTO_SHAKE:            'gesto-shake',
  ENTER_TINDER:           'enter_tinder',
  REPEAT_CAPTURE:         'repeat_capture',

  // Server → Controller
  START_EXPENSE_CAPTURE:  'start_expense_capture',

  // Controller → Server → Display
  EXPENSE_CREATED:        'expense_created',
  MARK_LIKE:              'mark_like',
  MARK_DISLIKE:           'mark_dislike',
  CONFIRM:                'confirm',
  CANCEL:                 'cancel',
  TOGGLE_CASH:            'toggle_cash',

  // Server → Display
  STATE_UPDATE:           'state_update',
};

module.exports = EVENTS;
