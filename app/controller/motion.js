// app/controller/motion.js
//
// MAPA DE GESTOS POR MODO:
//
//  idle        → shake            : GESTO_SHAKE (→ listening)
//  idle        → tilt adelante    : ENTER_TINDER
//  idle        → tilt izq/dcha   : TOGGLE_CASH
//  idle        → tilt atrás      : (ignorado)
//
//  listening   → tilt atrás      : CANCEL
//  listening   → cualquier otro  : (ignorado)
//
//  new_expense → tilt adelante   : CONFIRM
//  new_expense → tilt atrás      : CANCEL
//  new_expense → tilt izq/dcha   : REPEAT_CAPTURE (vuelve a listening)
//
//  tinder      → shake            : GESTO_SHAKE (→ listening)
//  tinder      → tilt dcha       : MARK_LIKE
//  tinder      → tilt izq        : MARK_DISLIKE
//  tinder      → tilt atrás      : CANCEL (salir → idle)
//  tinder      → tilt adelante   : (ignorado)

import {
  EVENTS,
  SHAKE_THRESHOLD, SHAKE_COOLDOWN_MS,
  TILT_LR_THRESHOLD, TILT_FB_THRESHOLD, TILT_BACK_THRESHOLD, TILT_COOLDOWN_MS,
} from './constants.js';
import { vibrateShort, vibrateDouble, vibrateSuccess, vibrateLong, setStatus } from './feedback.js';

// ── Estado interno ────────────────────────────────────────────────────────────
let lastShakeTime     = 0;
let lastTiltTime      = 0;
let tiltForwardActive = false;
let tiltBackActive    = false;
let tiltLeftActive    = false;
let tiltRightActive   = false;
let currentMode       = 'idle';

export function setCurrentMode(mode) {
  currentMode = mode;
}

// ── Inicialización ────────────────────────────────────────────────────────────
export function initMotion(socket) {
  _initShake(socket);
  _initTilt(socket);
}

// ── SHAKE ─────────────────────────────────────────────────────────────────────
function _initShake(socket) {
  const handler = (acc) => {
    if (!acc) return;
    const x = acc.x || 0, y = acc.y || 0, z = acc.z || 0;
    const mag = Math.sqrt(x * x + y * y + z * z);
    const now = Date.now();

    if (mag > SHAKE_THRESHOLD && now - lastShakeTime > SHAKE_COOLDOWN_MS) {
      // Shake solo actúa en idle y tinder
      if (currentMode === 'idle' || currentMode === 'tinder') {
        console.log('[Motion] SHAKE →', EVENTS.GESTO_SHAKE, mag.toFixed(1));
        vibrateShort();
        setStatus('📳 Shake detectado');
        socket.emit(EVENTS.GESTO_SHAKE);
        lastShakeTime = now;
      }
    }
  };

  // API moderna primero
  if (typeof Accelerometer !== 'undefined') {
    try {
      const sensor = new Accelerometer({ frequency: 30 });
      sensor.onerror = (e) => console.warn('[Motion] Accelerometer error:', e.error?.name);
      sensor.onreading = () => handler({ x: sensor.x, y: sensor.y, z: sensor.z });
      sensor.start();
      console.log('[Motion] Accelerometer iniciado (API moderna)');
      return;
    } catch (e) {
      console.warn('[Motion] Accelerometer no disponible, fallback a DeviceMotionEvent');
    }
  }

  const startListening = () => {
    window.addEventListener('devicemotion', (event) => {
      handler(event.accelerationIncludingGravity || event.acceleration);
    });
    console.log('[Motion] DeviceMotionEvent iniciado');
  };

  if (typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function') {
    document.addEventListener('click', async () => {
      try {
        const perm = await DeviceMotionEvent.requestPermission();
        if (perm === 'granted') startListening();
      } catch (e) {
        console.error('[Motion] Permiso denegado:', e);
      }
    }, { once: true });
  } else {
    startListening();
  }
}

// ── TILT ──────────────────────────────────────────────────────────────────────
function _initTilt(socket) {
  const startListening = () => {
    window.addEventListener('deviceorientation', (event) => {
      const beta  = event.beta  || 0;
      const gamma = event.gamma || 0;
      const now   = Date.now();

      const inForward = beta  >  TILT_FB_THRESHOLD;
      const inBack    = beta  <  TILT_BACK_THRESHOLD;
      const inRight   = gamma >  TILT_LR_THRESHOLD;
      const inLeft    = gamma < -TILT_LR_THRESHOLD;

      // Resetear flags al salir de zona
      if (!inForward) tiltForwardActive = false;
      if (!inBack)    tiltBackActive    = false;
      if (!inRight)   tiltRightActive   = false;
      if (!inLeft)    tiltLeftActive    = false;

      if (now - lastTiltTime < TILT_COOLDOWN_MS) return;

      // ── IDLE ──────────────────────────────────────────────────────────────
      if (currentMode === 'idle') {
        if (inForward && !tiltForwardActive) {
          tiltForwardActive = true; lastTiltTime = now;
          console.log('[Motion] IDLE: TILT FORWARD → ENTER_TINDER');
          vibrateSuccess(); setStatus('🃏 Entrando en Tinder...');
          socket.emit(EVENTS.ENTER_TINDER);
          return;
        }
        if ((inRight && !tiltRightActive) || (inLeft && !tiltLeftActive)) {
          if (inRight) tiltRightActive = true;
          if (inLeft)  tiltLeftActive  = true;
          lastTiltTime = now;
          console.log('[Motion] IDLE: TILT SIDE → TOGGLE_CASH');
          vibrateShort(); setStatus('💳 Cambiar método de pago');
          socket.emit(EVENTS.TOGGLE_CASH);
          return;
        }
        // tilt atrás ignorado en idle
        return;
      }

      // ── LISTENING ─────────────────────────────────────────────────────────
      if (currentMode === 'listening') {
        if (inBack && !tiltBackActive) {
          tiltBackActive = true; lastTiltTime = now;
          console.log('[Motion] LISTENING: TILT BACK → CANCEL');
          vibrateLong(); setStatus('❌ Cancelar grabación');
          socket.emit(EVENTS.CANCEL);
          return;
        }
        // cualquier otro gesto ignorado en listening
        return;
      }

      // ── NEW_EXPENSE (fase de confirmación) ────────────────────────────────
      if (currentMode === 'new_expense') {
        if (inForward && !tiltForwardActive) {
          tiltForwardActive = true; lastTiltTime = now;
          console.log('[Motion] NEW_EXPENSE: TILT FORWARD → CONFIRM');
          vibrateSuccess(); setStatus('✅ Confirmar gasto');
          socket.emit(EVENTS.CONFIRM);
          return;
        }
        if (inBack && !tiltBackActive) {
          tiltBackActive = true; lastTiltTime = now;
          console.log('[Motion] NEW_EXPENSE: TILT BACK → CANCEL');
          vibrateLong(); setStatus('❌ Cancelar gasto');
          socket.emit(EVENTS.CANCEL);
          return;
        }
        if ((inRight && !tiltRightActive) || (inLeft && !tiltLeftActive)) {
          if (inRight) tiltRightActive = true;
          if (inLeft)  tiltLeftActive  = true;
          lastTiltTime = now;
          console.log('[Motion] NEW_EXPENSE: TILT SIDE → REPEAT_CAPTURE');
          vibrateDouble(); setStatus('🔄 Repitiendo grabación...');
          socket.emit(EVENTS.REPEAT_CAPTURE);
          return;
        }
        return;
      }

      // ── TINDER ────────────────────────────────────────────────────────────
      if (currentMode === 'tinder') {
        if (inRight && !tiltRightActive) {
          tiltRightActive = true; lastTiltTime = now;
          console.log('[Motion] TINDER: TILT RIGHT → MARK_LIKE');
          vibrateDouble(); setStatus('💚 Me gusta');
          socket.emit(EVENTS.MARK_LIKE);
          return;
        }
        if (inLeft && !tiltLeftActive) {
          tiltLeftActive = true; lastTiltTime = now;
          console.log('[Motion] TINDER: TILT LEFT → MARK_DISLIKE');
          vibrateLong(); setStatus('❤️‍🔥 No me gusta');
          socket.emit(EVENTS.MARK_DISLIKE);
          return;
        }
        if (inBack && !tiltBackActive) {
          tiltBackActive = true; lastTiltTime = now;
          console.log('[Motion] TINDER: TILT BACK → CANCEL (salir)');
          vibrateLong(); setStatus('🚪 Saliendo de Tinder');
          socket.emit(EVENTS.CANCEL);
          return;
        }
        // tilt adelante ignorado en tinder
        return;
      }
    });
    console.log('[Motion] DeviceOrientationEvent iniciado');
  };

  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    document.addEventListener('click', async () => {
      try {
        const perm = await DeviceOrientationEvent.requestPermission();
        if (perm === 'granted') startListening();
      } catch (e) {
        console.error('[Motion] Permiso orientación denegado:', e);
      }
    }, { once: true });
  } else {
    startListening();
  }
}
