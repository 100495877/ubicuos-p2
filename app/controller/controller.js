// app/controller/controller.js
// Orquestador principal: conecta motion, voice y socket.

import { socket }                                    from './socket.js';
import { initMotion, setCurrentMode, recalibrate }   from './motion.js';
import { EVENTS }                                    from './constants.js';
import { vibrateSuccess, setStatus, setMode, setCash } from './feedback.js';
import { startListening, stopListening }             from './voice.js';

window.addEventListener('load', () => {
  console.log('[Controller] Inicializado');

  initMotion(socket);

  // Botón de recalibración manual
  document.getElementById('btn-recalibrate')?.addEventListener('click', () => {
    recalibrate();
  });

  // ── Estado global del servidor ───────────────────────────────────────────
  socket.on('state_update', (state) => {
    setCurrentMode(state.mode);
    setCash(state.defaultCash);
    const modeLabels = {
      idle:        '💤 En espera',
      listening:   '🎤 Escuchando',
      new_expense: '📝 Confirmar gasto',
      tinder:      '🃏 Modo Revisión',
    };
    setMode(modeLabels[state.mode] || state.mode);
  });

  // ── El servidor activa la captura de voz ─────────────────────────────────
  socket.on(EVENTS.START_EXPENSE_CAPTURE, () => {
    console.log('[Controller] Iniciando captura de voz...');
    stopListening();

    startListening(
      (gasto) => {
        socket.emit(EVENTS.EXPENSE_CREATED, gasto);
        setStatus(`📝 "${gasto.product}" ${gasto.price}€\n↑ Adelante: confirmar  ↓ Atrás: cancelar`);
      },
      (err) => {
        console.warn('[Controller] Error de reconocimiento:', err);
        socket.emit(EVENTS.CANCEL);
      }
    );
  });

  socket.on(EVENTS.CONFIRM,       () => { vibrateSuccess(); setStatus('✅ Gasto guardado'); });
  socket.on(EVENTS.CANCEL,        () => { stopListening(); setStatus('❌ Cancelado — sacude para registrar'); });
  socket.on(EVENTS.REPEAT_CAPTURE,() => { setStatus('🔄 Preparando nueva grabación…'); });
  socket.on(EVENTS.MARK_LIKE,     () => setStatus('💚 ¡Buen gasto!'));
  socket.on(EVENTS.MARK_DISLIKE,  () => setStatus('❌ Gasto no deseado'));
  socket.on(EVENTS.TOGGLE_CASH,   () => setStatus('💳 Método de pago cambiado'));

  socket.on('connect', () => {
    setStatus('📱 Calibrando… mantén el móvil quieto');
  });
});