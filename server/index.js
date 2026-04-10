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
  mode:           'idle',   // 'idle' | 'listening' | 'new_expense' | 'tinder'
  gastos:         [],
  pendingExpense: null,
  tinderIndex:    0,
  defaultCash:    false,    // método de pago por defecto (false = tarjeta)
};

function broadcast(event, data) { io.emit(event, data); }
function pushState()             { broadcast(EVENTS.STATE_UPDATE, state); }

// ─── RUTAS ESTÁTICAS ──────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/controller', express.static(path.join(__dirname, '..', 'app', 'controller')));
app.get('/', (req, res) => res.redirect('/display/'));

// ─── SOCKET HANDLERS ──────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  const id = socket.id.slice(0, 6);
  console.log(`[+] Dispositivo conectado: ${id}`);
  socket.emit(EVENTS.STATE_UPDATE, state);

  // ── 1. SHAKE → iniciar captura de voz ──────────────────────────────────
  socket.on(EVENTS.GESTO_SHAKE, () => {
    if (state.mode !== 'idle' && state.mode !== 'tinder') return;
    console.log(`[${id}] SHAKE → listening`);
    state.mode           = 'listening';
    state.pendingExpense = null;
    pushState();
    socket.emit(EVENTS.START_EXPENSE_CAPTURE);
  });

  // ── 2. ENTER_TINDER (tilt adelante en idle) ────────────────────────────
  socket.on(EVENTS.ENTER_TINDER, () => {
    if (state.mode !== 'idle') return;
    if (state.gastos.length === 0) {
      socket.emit(EVENTS.STATE_UPDATE, state); // refrescar sin cambiar modo
      return;
    }
    console.log(`[${id}] ENTER_TINDER → tinder`);
    state.tinderIndex = 0;
    state.mode        = 'tinder';
    pushState();
  });

  // ── 3. GASTO CREADO (voz procesada en móvil) ───────────────────────────
  socket.on(EVENTS.EXPENSE_CREATED, (nuevoGasto) => {
    // voice.js garantiza que nuevoGasto nunca es null aquí,
    // pero lo defendemos igualmente para robustez.
    if (!nuevoGasto) {
      console.warn(`[${id}] EXPENSE_CREATED con gasto nulo — ignorado`);
      return;
    }
    console.log(`[${id}] EXPENSE_CREATED:`, nuevoGasto);
    nuevoGasto.id        = Date.now();
    nuevoGasto.timestamp = new Date().toISOString();
    nuevoGasto.like      = null;
    // Si la voz no detectó método de pago explícito, usar el por defecto
    if (nuevoGasto.cash === false && state.defaultCash) {
      nuevoGasto.cash = true;
    }
    state.pendingExpense = nuevoGasto;
    state.mode           = 'new_expense';
    pushState();
  });

  // ── 4. CONFIRM (tilt adelante en new_expense) ──────────────────────────
  socket.on(EVENTS.CONFIRM, () => {
    if (state.mode !== 'new_expense') return;
    console.log(`[${id}] CONFIRM`);
    if (state.pendingExpense) state.gastos.push(state.pendingExpense);
    state.pendingExpense = null;
    state.mode           = 'idle';
    pushState();
    broadcast(EVENTS.CONFIRM, {});
  });

  // ── 5. CANCEL ──────────────────────────────────────────────────────────
  socket.on(EVENTS.CANCEL, () => {
    if (state.mode === 'idle') return;
    console.log(`[${id}] CANCEL (modo: ${state.mode})`);
    state.pendingExpense = null;
    state.mode           = 'idle';
    pushState();
    broadcast(EVENTS.CANCEL, {});
  });

  // ── 6. REPEAT_CAPTURE (tilt lateral en new_expense) ───────────────────
  socket.on(EVENTS.REPEAT_CAPTURE, () => {
    if (state.mode !== 'new_expense') return;
    console.log(`[${id}] REPEAT_CAPTURE → listening`);
    state.pendingExpense = null;
    state.mode           = 'listening';
    pushState();
    broadcast(EVENTS.REPEAT_CAPTURE, {});
    socket.emit(EVENTS.START_EXPENSE_CAPTURE);
  });

  // ── 7. TOGGLE_CASH ─────────────────────────────────────────────────────
  // En idle: cambia el método de pago por defecto
  // En new_expense: cambia el método del gasto pendiente
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

  // ── 8. MARK LIKE / DISLIKE (tinder) ───────────────────────────────────
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

  socket.on('disconnect', () => {
    console.log(`[-] Dispositivo desconectado: ${id}`);
  });
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function _advanceTinder() {
  state.tinderIndex++;
  if (state.tinderIndex >= state.gastos.length) {
    state.tinderIndex = 0;
    state.mode        = 'idle';
  }
  pushState();
}

// ─── INICIO ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  let localIP = 'localhost';
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) localIP = iface.address;
    }
  }
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║       Cartera Inteligente — Servidor         ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Display  →  http://localhost:${PORT}/display/   ║`);
  console.log(`║  Móvil    →  http://${localIP}:${PORT}/controller/ ║`);
  console.log('╚══════════════════════════════════════════════╝\n');
});
