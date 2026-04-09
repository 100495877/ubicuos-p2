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
  mode:            'idle',      // 'idle' | 'listening' | 'new_expense' | 'tinder'
  gastos:          [],          // lista de gastos confirmados
  pendingExpense:  null,        // gasto en espera de confirmación
  tinderIndex:     0,           // índice en modo Tinder
};

function broadcast(event, data) {
  io.emit(event, data);
}

function pushState() {
  broadcast(EVENTS.STATE_UPDATE, state);
}

// ─── RUTAS ESTÁTICAS ──────────────────────────────────────────────────────────
// Display: http://localhost:3000/display/
app.use(express.static(path.join(__dirname, '..', 'public')));

// Controller (móvil): http://<IP>:3000/controller/
app.use('/controller', express.static(path.join(__dirname, '..', 'app', 'controller')));

// Redirigir raíz al display
app.get('/', (req, res) => {
  res.redirect('/display/');
});

// ─── SOCKET HANDLERS ──────────────────────────────────────────────────────────
let lastConfirmTime = 0;
const CONFIRM_DEBOUNCE_MS = 2000;

io.on('connection', (socket) => {
  const id = socket.id.slice(0, 6);
  console.log(`[+] Dispositivo conectado: ${id}`);

  // Enviar estado actual al cliente que se conecta
  socket.emit(EVENTS.STATE_UPDATE, state);

  // ── 1. SHAKE → iniciar captura ───────────────────────────────────────────
  socket.on(EVENTS.GESTO_SHAKE, () => {
    if (state.mode !== 'idle' && state.mode !== 'tinder') return;
    console.log(`[${id}] SHAKE → inicio captura`);
    state.mode = 'listening';
    pushState();
    socket.emit(EVENTS.START_EXPENSE_CAPTURE);
  });

  // ── 2. DOUBLE SHAKE → toggle efectivo en gasto pendiente ────────────────
  socket.on(EVENTS.GESTO_DOUBLE_SHAKE, () => {
    console.log(`[${id}] DOUBLE SHAKE → toggle cash`);
    io.emit(EVENTS.TOGGLE_CASH);
    if (state.pendingExpense) {
      state.pendingExpense.cash = !state.pendingExpense.cash;
      pushState();
    }
  });

  // ── 3. GASTO CREADO (voz procesada en móvil) ────────────────────────────
  socket.on(EVENTS.EXPENSE_CREATED, (nuevoGasto) => {
    console.log(`[${id}] EXPENSE_CREATED:`, nuevoGasto);
    // Añadir id único y timestamp
    nuevoGasto.id        = Date.now();
    nuevoGasto.timestamp = new Date().toISOString();
    nuevoGasto.like      = null; // sin evaluar aún

    state.pendingExpense = nuevoGasto;
    state.mode           = 'new_expense';
    pushState();
  });

  // ── 4. CONFIRM ───────────────────────────────────────────────────────────
  socket.on(EVENTS.CONFIRM, () => {
    const now = Date.now();
    if (now - lastConfirmTime < CONFIRM_DEBOUNCE_MS) return;  // ← añadir esto
    lastConfirmTime = now;
    console.log(`[${id}] CONFIRM  (modo: ${state.mode})`);

    if (state.mode === 'new_expense' && state.pendingExpense) {
      state.gastos.push(state.pendingExpense);
      state.pendingExpense = null;
      state.mode           = 'idle';
      pushState();

    } else if (state.mode === 'tinder') {
      // Avanzar al siguiente sin evaluar
      _advanceTinder();
    } else if (state.mode === 'idle') {
      // Entrar en modo Tinder si hay gastos
      if (state.gastos.length > 0) {
        state.tinderIndex = 0;
        state.mode        = 'tinder';
        pushState();
      }
    }
    broadcast(EVENTS.CONFIRM, {});
  });

  // ── 5. CANCEL ────────────────────────────────────────────────────────────
  socket.on(EVENTS.CANCEL, () => {
    console.log(`[${id}] CANCEL  (modo: ${state.mode})`);

    if (state.mode === 'new_expense') {
      state.pendingExpense = null;
      state.mode           = 'idle';
    } else if (state.mode === 'listening') {
      state.mode = 'idle';
    } else if (state.mode === 'tinder') {
      state.mode = 'idle';
    }
    pushState();
    broadcast(EVENTS.CANCEL, {});
  });

  // ── 6. TOGGLE CASH ───────────────────────────────────────────────────────
  socket.on(EVENTS.TOGGLE_CASH, () => {
    console.log(`[${id}] TOGGLE_CASH`);
    if (state.pendingExpense) {
      state.pendingExpense.cash = !state.pendingExpense.cash;
      pushState();
    }
    broadcast(EVENTS.TOGGLE_CASH, {});
  });

  // ── 7. NAVEGACIÓN (modo Tinder o lista) ──────────────────────────────────
  socket.on(EVENTS.NAVIGATE_LEFT, () => {
    console.log(`[${id}] NAVIGATE_LEFT`);
    if (state.mode === 'tinder') _moveTinder(-1);
    broadcast(EVENTS.NAVIGATE_LEFT, {});
  });

  socket.on(EVENTS.NAVIGATE_RIGHT, () => {
    console.log(`[${id}] NAVIGATE_RIGHT`);
    if (state.mode === 'tinder') _moveTinder(1);
    broadcast(EVENTS.NAVIGATE_RIGHT, {});
  });

  // ── 8. MARK LIKE / DISLIKE (modo Tinder) ─────────────────────────────────
  socket.on(EVENTS.MARK_LIKE, () => {
    console.log(`[${id}] MARK_LIKE`);
    if (state.mode === 'tinder') {
      const g = state.gastos[state.tinderIndex];
      if (g) g.like = true;
      pushState();
      broadcast(EVENTS.MARK_LIKE, { index: state.tinderIndex });
      setTimeout(() => _advanceTinder(), 600);
    }
  });

  socket.on(EVENTS.MARK_DISLIKE, () => {
    console.log(`[${id}] MARK_DISLIKE`);
    if (state.mode === 'tinder') {
      const g = state.gastos[state.tinderIndex];
      if (g) g.like = false;
      pushState();
      broadcast(EVENTS.MARK_DISLIKE, { index: state.tinderIndex });
      setTimeout(() => _advanceTinder(), 600);
    }
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

function _moveTinder(delta) {
  state.tinderIndex = Math.max(0,
    Math.min(state.gastos.length - 1, state.tinderIndex + delta));
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
      if (iface.family === 'IPv4' && !iface.internal) {
        localIP = iface.address;
      }
    }
  }
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║       Cartera Inteligente — Servidor         ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Display  →  http://localhost:${PORT}/display/   ║`);
  console.log(`║  Móvil    →  http://${localIP}:${PORT}/controller/ ║`);
  console.log('╚══════════════════════════════════════════════╝\n');
});