// app/controller/controller.js
import { socket }                                      from './socket.js';
import { initMotion, setCurrentMode, recalibrate }     from './motion.js';
import { EVENTS }                                      from './constants.js';
import { vibrateSuccess, setStatus, setMode, setCash } from './feedback.js';
import { startListening, startListeningAmount, stopListening } from './voice.js';

window.addEventListener('load', () => {
  console.log('[Controller] Inicializado');
  initMotion(socket);

  document.getElementById('btn-recalibrate')?.addEventListener('click', recalibrate);

  // ── Estado global ────────────────────────────────────────────────────────
  socket.on('state_update', (state) => {
    setCurrentMode(state.mode);
    setCash(state.defaultCash);
    const labels = {
      idle:        'En espera',
      listening:   'Escuchando',
      new_expense: 'Confirmar gasto',
      tinder:      'Modo revisión',
      budget:      'Tope de gasto',
    };
    setMode(labels[state.mode] || state.mode);

    // Si entramos en budget con tope existente, indicar opciones al usuario
    if (state.mode === 'budget' && state.budget) {
      setStatus(`Tope actual: ${state.budget}€\nAdelante: aceptar | Lados: editar`);
    }
  });

  // ── Captura de gasto ─────────────────────────────────────────────────────
  socket.on(EVENTS.START_EXPENSE_CAPTURE, () => {
    console.log('[Controller] Iniciando captura de voz…');
    stopListening();
    startListening(
      (gasto) => {
        socket.emit(EVENTS.EXPENSE_CREATED, gasto);
        setStatus(`${gasto.product} | ${gasto.price}€\nAdelante: confirmar | Atrás: cancelar | Lados: repetir`);
      },
      (err) => {
        console.warn('[Controller] Error voz:', err);
        socket.emit(EVENTS.CANCEL);
      }
    );
  });

  // ── Captura de tope de gasto ─────────────────────────────────────────────
  socket.on(EVENTS.START_BUDGET_CAPTURE, () => {
    console.log('[Controller] Capturando tope de gasto…');
    stopListening();
    setStatus('Di la cantidad límite\nEjemplo: doscientos euros');
    startListeningAmount(
      (amount) => {
        socket.emit(EVENTS.SET_BUDGET, amount);
        setStatus(`Tope fijado: ${amount}€`);
      },
      (err) => {
        console.warn('[Controller] Error captura tope:', err);
        setStatus('No se ha entendido la cantidad\nInclina atrás para cancelar');
      }
    );
  });

  // ── Alertas de tope ──────────────────────────────────────────────────────
  socket.on(EVENTS.BUDGET_ALERT, (data) => {
    const patterns = {
      danger:  [200, 100, 200, 100, 200],
      warning: [150, 80, 150],
      info:    [100],
    };
    if ('vibrate' in navigator) navigator.vibrate(patterns[data.level] || [100]);
    setStatus(`${data.label}\n${data.total.toFixed(2)}€ / ${data.budget}€`);
  });

  // ── Eventos estándar ─────────────────────────────────────────────────────
  socket.on(EVENTS.CONFIRM,        () => { vibrateSuccess(); setStatus('Operación confirmada'); });
  socket.on(EVENTS.CANCEL,         () => { stopListening(); setStatus('Operación cancelada\nSacude para registrar'); });
  socket.on(EVENTS.REPEAT_CAPTURE, () => setStatus('Preparando nueva grabación')); 
  socket.on(EVENTS.MARK_LIKE,      () => setStatus('Gasto aprobado')); 
  socket.on(EVENTS.MARK_DISLIKE,   () => setStatus('Gasto marcado como no deseado')); 
  socket.on(EVENTS.TOGGLE_CASH,    () => setStatus('Método de pago actualizado')); 
  socket.on('connect',             () => setStatus('Calibrando sensores\nMantén el móvil quieto'));
});
