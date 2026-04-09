// app/controller/controller.js
// Orquestador principal: conecta motion, voice y socket.

import { socket }                              from './socket.js';
import { initMotion, setCurrentMode }          from './motion.js';
import { EVENTS }                              from './constants.js';
import { vibrateSuccess, setStatus, setMode, setCash } from './feedback.js';
import { startListening, stopListening }       from './voice.js';

window.addEventListener('load', () => {
  console.log('[Controller] Inicializado');
  setStatus('Conectando...');
  initMotion(socket);

  // ── Estado global del servidor ───────────────────────────────────────────
  socket.on('state_update', (state) => {
    setCurrentMode(state.mode);
    setCash(state.defaultCash);

    const modeLabels = {
      idle:         '💤 En espera',
      listening:    '🎤 Escuchando',
      new_expense:  '📝 Confirmar gasto',
      tinder:       '🃏 Modo Revisión',
    };
    setMode(modeLabels[state.mode] || state.mode);
  });

  // ── El servidor activa la captura de voz ─────────────────────────────────
  socket.on(EVENTS.START_EXPENSE_CAPTURE, () => {
    console.log('[Controller] Iniciando captura de voz...');
    stopListening();

    startListening(
      // Éxito: gasto parseado correctamente
      (gasto) => {
        socket.emit(EVENTS.EXPENSE_CREATED, gasto);
        setStatus(`📝 "${gasto.product}" ${gasto.price}€\n↑ Adelante: confirmar  ↓ Atrás: cancelar`);
      },
      // Error real del reconocedor (permiso, red…): volver a idle
      (err) => {
        console.warn('[Controller] Error de reconocimiento:', err);
        socket.emit(EVENTS.CANCEL);
        // setStatus ya fue actualizado dentro de voice.js
      }
    );
  });

  // ── Confirmación ─────────────────────────────────────────────────────────
  socket.on(EVENTS.CONFIRM, () => {
    vibrateSuccess();
    setStatus('✅ Gasto guardado');
  });

  // ── Cancelación ──────────────────────────────────────────────────────────
  socket.on(EVENTS.CANCEL, () => {
    stopListening();
    setStatus('❌ Cancelado — sacude para registrar un gasto');
  });

  // ── Repetir captura ──────────────────────────────────────────────────────
  socket.on(EVENTS.REPEAT_CAPTURE, () => {
    setStatus('🔄 Preparando nueva grabación…');
  });

  // ── Tinder feedback ──────────────────────────────────────────────────────
  socket.on(EVENTS.MARK_LIKE,    () => setStatus('💚 ¡Buen gasto!'));
  socket.on(EVENTS.MARK_DISLIKE, () => setStatus('❌ Gasto no deseado'));
  socket.on(EVENTS.TOGGLE_CASH,  () => setStatus('💳 Método de pago cambiado'));

  socket.on('connect', () => {
    setStatus('📱 Controller listo — sacude para registrar un gasto');
  });
});
