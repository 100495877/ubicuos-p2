// app/controller/controller.js
// Orquestador principal: conecta motion, voice y socket.

import { socket }                            from './socket.js';
import { initMotion, setCurrentMode }        from './motion.js';
import { startListening }                    from './voice.js';
import { EVENTS }                            from './constants.js';
import { vibrateSuccess, setStatus, setMode } from './feedback.js';

// ── Arranque ──────────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  console.log('[Controller] Inicializado');
  setStatus('Conectando...');

  // Iniciar detección de movimiento
  initMotion(socket);

  // ── Recibir estado global del servidor ──────────────────────────────────
  socket.on('state_update', (state) => {
    setCurrentMode(state.mode);
    const modeLabels = {
      idle:         '💤 En espera',
      listening:    '🎤 Escuchando',
      new_expense:  '📝 Nuevo gasto',
      tinder:       '🃏 Modo Tinder',
    };
    setMode(modeLabels[state.mode] || state.mode);
  });

  // ── El servidor pide iniciar captura de voz ─────────────────────────────
  socket.on(EVENTS.START_EXPENSE_CAPTURE, () => {
    console.log('[Controller] Iniciando captura de voz...');
    setStatus('🎤 Di tu gasto: "café 2.50"');

    startListening(
      socket,
      // Éxito: gasto parseado
      (gasto) => {
        console.log('[Controller] Enviando gasto:', gasto);
        socket.emit(EVENTS.EXPENSE_CREATED, gasto);
        setStatus(`💳 Gasto enviado: ${gasto.product} ${gasto.price}€`);
      },
      // Error: no se entendió
      (err) => {
        console.warn('[Controller] Error de voz:', err);
        setStatus('⚠️ Sacude de nuevo para reintentar');
      }
    );
  });

  // ── Retroalimentación de acciones ───────────────────────────────────────
  socket.on(EVENTS.CONFIRM, () => {
    vibrateSuccess();
    setStatus('✅ Confirmado');
  });

  socket.on(EVENTS.CANCEL, () => {
    setStatus('❌ Cancelado');
  });

  socket.on(EVENTS.MARK_LIKE, () => {
    setStatus('💚 ¡Buen gasto!');
  });

  socket.on(EVENTS.MARK_DISLIKE, () => {
    setStatus('❤️‍🔥 Gasto no deseado');
  });

  socket.on(EVENTS.TOGGLE_CASH, () => {
    setStatus('💵 Método de pago cambiado');
  });

  socket.on('connect', () => {
    setStatus('📱 Controller listo — Sacude para registrar');
  });
});