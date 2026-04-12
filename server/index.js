// server/index.js
const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const EVENTS = require('./events');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

// ─── ESTADO GLOBAL ────────────────────────────────────────────────────────────
let state = {
  mode:           'idle',   // 'idle'|'listening'|'new_expense'|'tinder'|'budget'
  gastos:         [],
  pendingExpense: null,
  tinderIndex:    0,
  defaultCash:    false,
  budget:         null,     // null = sin tope, número = límite en €
  budgetAlerts:   [],       // umbrales ya notificados: [50, 75, 100]
};

function broadcast(event, data) { io.emit(event, data); }
function pushState()             { broadcast(EVENTS.STATE_UPDATE, state); }

// ─── COMPROBACIÓN DE TOPE ─────────────────────────────────────────────────────
function checkBudgetAlerts() {
  if (!state.budget || state.budget <= 0) return;
  const total = state.gastos.reduce((s, g) => s + (g.price || 0), 0);
  const pct   = (total / state.budget) * 100;

  const thresholds = [
    { pct: 100, label: '🚨 Has superado el tope de gasto', level: 'danger' },
    { pct: 75,  label: '⚠️ Llevas el 75% del tope de gasto', level: 'warning' },
    { pct: 50,  label: '💡 Llevas el 50% del tope de gasto', level: 'info' },
  ];

  for (const t of thresholds) {
    if (pct >= t.pct && !state.budgetAlerts.includes(t.pct)) {
      state.budgetAlerts.push(t.pct);
      broadcast(EVENTS.BUDGET_ALERT, {
        threshold: t.pct,
        label:     t.label,
        level:     t.level,
        total,
        budget:    state.budget,
      });
      console.log(`[Budget] Alerta ${t.pct}% — total: ${total.toFixed(2)}€ / ${state.budget}€`);
    }
  }
}

// ─── RUTAS ESTÁTICAS ──────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/controller', express.static(path.join(__dirname, '..', 'app', 'controller')));
app.get('/', (req, res) => res.redirect('/display/'));

// ─── SOCKET HANDLERS ──────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  const id = socket.id.slice(0, 6);
  console.log(`[+] Dispositivo conectado: ${id}`);
  socket.emit(EVENTS.STATE_UPDATE, state);

  // ── 1. SHAKE → iniciar captura de voz ─────────────────────────────────────
  socket.on(EVENTS.GESTO_SHAKE, () => {
    if (state.mode !== 'idle' && state.mode !== 'tinder') return;
    console.log(`[${id}] SHAKE → listening`);
    state.mode = 'listening'; state.pendingExpense = null;
    pushState();
    socket.emit(EVENTS.START_EXPENSE_CAPTURE);
  });

  // ── 2. ENTER_TINDER ───────────────────────────────────────────────────────
  socket.on(EVENTS.ENTER_TINDER, () => {
    if (state.mode !== 'idle') return;
    if (state.gastos.length === 0) { socket.emit(EVENTS.STATE_UPDATE, state); return; }
    console.log(`[${id}] ENTER_TINDER`);
    state.tinderIndex = 0; state.mode = 'tinder';
    pushState();
  });

  // ── 3. ENTER_BUDGET (tilt atrás en idle) ──────────────────────────────────
  socket.on(EVENTS.ENTER_BUDGET, () => {
    if (state.mode !== 'idle') return;
    console.log(`[${id}] ENTER_BUDGET — tope actual: ${state.budget}`);
    state.mode = 'budget';
    pushState();

    if (!state.budget) {
      // Sin tope previo → pedir voz directamente
      socket.emit(EVENTS.START_BUDGET_CAPTURE);
    }
    // Si hay tope previo, el display muestra opciones y esperamos
    // CONFIRM (aceptar) o EDIT_BUDGET (editar)
  });

  // ── 4. EDIT_BUDGET (tilt lateral en budget con tope existente) ────────────
  socket.on(EVENTS.EDIT_BUDGET, () => {
    if (state.mode !== 'budget') return;
    console.log(`[${id}] EDIT_BUDGET → pedir nueva cantidad`);
    socket.emit(EVENTS.START_BUDGET_CAPTURE);
  });

  // ── 5. SET_BUDGET (voz procesada en móvil) ────────────────────────────────
  socket.on(EVENTS.SET_BUDGET, (amount) => {
    if (state.mode !== 'budget') return;
    console.log(`[${id}] SET_BUDGET: ${amount}€`);
    state.budget      = amount;
    state.budgetAlerts = []; // resetear alertas con el nuevo tope
    state.mode        = 'idle';
    pushState();
    broadcast(EVENTS.CONFIRM, { budget: amount });
    // Comprobar inmediatamente por si ya hay gastos
    checkBudgetAlerts();
  });

  // ── 6. GASTO CREADO ───────────────────────────────────────────────────────
  socket.on(EVENTS.EXPENSE_CREATED, (nuevoGasto) => {
    if (!nuevoGasto) { console.warn(`[${id}] EXPENSE_CREATED nulo — ignorado`); return; }
    console.log(`[${id}] EXPENSE_CREATED:`, nuevoGasto);
    nuevoGasto.id        = Date.now();
    nuevoGasto.timestamp = new Date().toISOString();
    nuevoGasto.like      = null;
    if (nuevoGasto.cash === false && state.defaultCash) nuevoGasto.cash = true;
    state.pendingExpense = nuevoGasto;
    state.mode           = 'new_expense';
    pushState();
  });

  // ── 7. CONFIRM ────────────────────────────────────────────────────────────
  socket.on(EVENTS.CONFIRM, () => {
    if (state.mode === 'new_expense') {
      console.log(`[${id}] CONFIRM → guardar gasto`);
      if (state.pendingExpense) state.gastos.push(state.pendingExpense);
      state.pendingExpense = null;
      state.mode           = 'idle';
      pushState();
      broadcast(EVENTS.CONFIRM, {});
      checkBudgetAlerts();
    } else if (state.mode === 'budget') {
      // Aceptar tope existente sin cambios
      console.log(`[${id}] CONFIRM en budget → aceptar tope ${state.budget}€`);
      state.mode = 'idle';
      pushState();
      broadcast(EVENTS.CONFIRM, {});
    }
  });

  // ── 8. CANCEL ─────────────────────────────────────────────────────────────
  socket.on(EVENTS.CANCEL, () => {
    if (state.mode === 'idle') return;
    console.log(`[${id}] CANCEL (modo: ${state.mode})`);
    state.pendingExpense = null;
    state.mode           = 'idle';
    pushState();
    broadcast(EVENTS.CANCEL, {});
  });

  // ── 9. REPEAT_CAPTURE ─────────────────────────────────────────────────────
  socket.on(EVENTS.REPEAT_CAPTURE, () => {
    if (state.mode !== 'new_expense') return;
    console.log(`[${id}] REPEAT_CAPTURE → listening`);
    state.pendingExpense = null; state.mode = 'listening';
    pushState();
    broadcast(EVENTS.REPEAT_CAPTURE, {});
    socket.emit(EVENTS.START_EXPENSE_CAPTURE);
  });

  // ── 10. TOGGLE_CASH ───────────────────────────────────────────────────────
  socket.on(EVENTS.TOGGLE_CASH, () => {
    console.log(`[${id}] TOGGLE_CASH (modo: ${state.mode})`);
    if (state.mode === 'new_expense' && state.pendingExpense) {
      state.pendingExpense.cash = !state.pendingExpense.cash;
    } else {
      state.defaultCash = !state.defaultCash;
    }
    pushState();
    broadcast(EVENTS.TOGGLE_CASH, {});
  });

  // ── 11. MARK LIKE / DISLIKE ───────────────────────────────────────────────
  socket.on(EVENTS.MARK_LIKE, () => {
    if (state.mode !== 'tinder') return;
    const g = state.gastos[state.tinderIndex];
    if (g) g.like = true;
    pushState();
    broadcast(EVENTS.MARK_LIKE, { index: state.tinderIndex });
    setTimeout(() => _advanceTinder(), 600);
  });

  socket.on(EVENTS.MARK_DISLIKE, () => {
    if (state.mode !== 'tinder') return;
    const g = state.gastos[state.tinderIndex];
    if (g) g.like = false;
    pushState();
    broadcast(EVENTS.MARK_DISLIKE, { index: state.tinderIndex });
    setTimeout(() => _advanceTinder(), 600);
  });

  socket.on('disconnect', () => console.log(`[-] Dispositivo desconectado: ${id}`));
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function _advanceTinder() {
  state.tinderIndex++;
  if (state.tinderIndex >= state.gastos.length) {
    state.tinderIndex = 0; state.mode = 'idle';
  }
  pushState();
}

// ─── INICIO ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  let localIP = 'localhost';
  for (const ifaces of Object.values(nets))
    for (const iface of ifaces)
      if (iface.family === 'IPv4' && !iface.internal) localIP = iface.address;
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║       Cartera Inteligente — Servidor         ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Display  →  http://localhost:${PORT}/display/   ║`);
  console.log(`║  Móvil    →  http://${localIP}:${PORT}/controller/ ║`);
  console.log('╚══════════════════════════════════════════════╝\n');
});
