// app/controller/controller.js
// Orquestador principal: conecta motion, voice y socket.

import { socket }                              from './socket.js';
import { initMotion, setCurrentMode }          from './motion.js';
import { EVENTS }                              from './constants.js';
import { vibrateSuccess, setStatus, setMode }  from './feedback.js';
import { startListening, stopListening }       from './voice.js';

// Gasto capturado por voz, pendiente de confirmación
let currentGasto = null;

window.addEventListener('load', () => {
  console.log('[Controller] Inicializado');
  setStatus('Conectando...');

  initMotion(socket);

  // ── Estado global del servidor ───────────────────────────────────────────
  socket.on('state_update', (state) => {
    setCurrentMode(state.mode);
    const modeLabels = {
      idle:         '💤 En espera',
      listening:    '🎤 Escuchando',
      new_expense:  '📝 Confirmar gasto',
      tinder:       '🃏 Modo Tinder',
    };
    setMode(modeLabels[state.mode] || state.mode);
  });

  // ── El servidor activa la captura de voz ────────────────────────────────
  // Ocurre al entrar en modo 'listening' (tras shake)
  // También ocurre tras REPEAT_CAPTURE
  socket.on(EVENTS.START_EXPENSE_CAPTURE, () => {
    console.log('[Controller] Iniciando captura de voz...');
    currentGasto = null;
    stopListening(); // asegurarse de que no haya una sesión anterior activa

    startListening(
      socket,
      (gasto) => {
        // La voz terminó — guardamos y esperamos confirmación del usuario
        currentGasto = gasto;
        setStatus(`🎤 "${gasto.product}" ${gasto.price}€\nInclina adelante para confirmar\nInclina atrás para cancelar\nInclina a los lados para repetir`);
        // Notificar al servidor que hay un gasto pendiente de revisión
        socket.emit(EVENTS.EXPENSE_CREATED, gasto);
      },
      (err) => {
        console.warn('[Controller] Error de voz:', err);
        setStatus('⚠️ No se entendió — inclina a los lados para repetir o atrás para cancelar');
        // Aunque haya error enviamos un gasto vacío para que el servidor
        // ponga el modo en new_expense y el usuario pueda repetir o cancelar
        socket.emit(EVENTS.EXPENSE_CREATED, null);
      }
    );
  });

  // ── CONFIRM (tilt adelante en new_expense) ───────────────────────────────
  // El servidor ya guardó el gasto al recibir EXPENSE_CREATED,
  // aquí solo damos feedback al usuario
  socket.on(EVENTS.CONFIRM, () => {
    vibrateSuccess();
    if (currentGasto) {
      setStatus(`✅ Gasto guardado: ${currentGasto.product} ${currentGasto.price}€`);
      currentGasto = null;
    } else {
      setStatus('✅ Confirmado');
    }
  });

  // ── CANCEL ───────────────────────────────────────────────────────────────
  socket.on(EVENTS.CANCEL, () => {
    stopListening();
    currentGasto = null;
    setStatus('❌ Cancelado');
  });

  // ── REPEAT_CAPTURE (tilt lateral en new_expense) ─────────────────────────
  // El servidor vuelve a emitir START_EXPENSE_CAPTURE, este handler
  // solo pone el status mientras llega
  socket.on(EVENTS.REPEAT_CAPTURE, () => {
    setStatus('🔄 Preparando grabación...');
  });

  // ── Feedback tinder ──────────────────────────────────────────────────────
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
    setStatus('📱 Controller listo — Sacude para registrar un gasto');
  });
});
