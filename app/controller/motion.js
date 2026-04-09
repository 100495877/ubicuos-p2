// app/controller/motion.js
// Detecta:
//   - Shake  → START_EXPENSE_CAPTURE
//   - Double shake → TOGGLE_CASH
//   - Tilt derecha  (gamma > TILT_LR)  → NAVIGATE_RIGHT o MARK_LIKE
//   - Tilt izquierda(gamma < -TILT_LR) → NAVIGATE_LEFT  o MARK_DISLIKE
//   - Inclinación fuerte dcha (gamma > TILT_LIKE)    → MARK_LIKE
//   - Inclinación fuerte izda (gamma < TILT_DISLIKE)  → MARK_DISLIKE
//   - Tilt adelante (beta > TILT_FB)   → CONFIRM
//   - Tilt atrás    (beta < TILT_BACK) → CANCEL

import {
  EVENTS,
  SHAKE_THRESHOLD, SHAKE_COOLDOWN_MS, DOUBLE_SHAKE_WINDOW_MS,
  TILT_LR_THRESHOLD, TILT_FB_THRESHOLD, TILT_BACK_THRESHOLD, TILT_COOLDOWN_MS,
  TILT_LIKE_THRESHOLD, TILT_DISLIKE_THRESHOLD,
} from './constants.js';
import { vibrateShort, vibrateDouble, vibrateSuccess, vibrateLong, setStatus } from './feedback.js';

// ── Estado interno ────────────────────────────────────────────────────────────
let tiltForwardActive = false;
let tiltBackActive    = false;
let lastShakeTime    = 0;
let prevShakeTime    = 0;   // para detectar doble shake
let lastTiltTime     = 0;
let tiltActive       = false; // true mientras el dispositivo está inclinado
let currentMode      = 'idle'; // reflejo local del modo del servidor

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
      // Comprobar doble shake
      if (now - prevShakeTime < DOUBLE_SHAKE_WINDOW_MS) {
        // ── DOBLE SHAKE → toggle efectivo ───────────────────────────────
        console.log('[Motion] DOUBLE SHAKE →', EVENTS.GESTO_DOUBLE_SHAKE);
        vibrateDouble();
        setStatus('💵 Método de pago alternado');
        socket.emit(EVENTS.GESTO_DOUBLE_SHAKE);
        prevShakeTime = 0;
      } else {
        // ── SHAKE SIMPLE → iniciar captura ──────────────────────────────
        console.log('[Motion] SHAKE →', EVENTS.GESTO_SHAKE, mag.toFixed(1));
        vibrateShort();
        setStatus('📳 Shake detectado');
        socket.emit(EVENTS.GESTO_SHAKE);
        prevShakeTime = lastShakeTime;
      }
      lastShakeTime = now;
    }
  };

  // Intentar API moderna primero
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

  // Fallback: DeviceMotionEvent
  const startListening = () => {
    window.addEventListener('devicemotion', (event) => {
      handler(event.accelerationIncludingGravity || event.acceleration);
    });
    console.log('[Motion] DeviceMotionEvent iniciado');
  };

  // iOS 13+ requiere permiso explícito
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
      const beta  = event.beta  || 0;  // front/back tilt  (-180…180)
      const gamma = event.gamma || 0;  // left/right tilt  (-90…90)
      const now   = Date.now();

      if (now - lastTiltTime < TILT_COOLDOWN_MS) return;

      // ── CONFIRM (inclinar hacia adelante) ────────────────────────────────
      if (beta > TILT_FB_THRESHOLD) {
        if (!tiltForwardActive) {          // solo al entrar, no mientras se sostiene
          tiltForwardActive = true;
          tiltBackActive    = false;
          if (now - lastTiltTime > TILT_COOLDOWN_MS) {
            lastTiltTime = now;
            console.log('[Motion] TILT FORWARD → CONFIRM', beta.toFixed(1));
            vibrateSuccess();
            setStatus('✅ Confirmar');
            socket.emit(EVENTS.CONFIRM);
          }
        }
        return;
      }

      // ── CANCEL (inclinar hacia atrás) ────────────────────────────────────
      if (beta < TILT_BACK_THRESHOLD) {
        if (!tiltBackActive) {             // solo al entrar, no mientras se sostiene
          tiltBackActive    = true;
          tiltForwardActive = false;
          if (now - lastTiltTime > TILT_COOLDOWN_MS) {
            lastTiltTime = now;
            console.log('[Motion] TILT BACK → CANCEL', beta.toFixed(1));
            vibrateLong();
            setStatus('❌ Cancelar');
            socket.emit(EVENTS.CANCEL);
          }
        }
        return;
      }
      tiltForwardActive = false;
      tiltBackActive    = false;

      // ── MARK_LIKE (inclinación fuerte dcha en modo tinder) ────────────────
      if (currentMode === 'tinder' && gamma > TILT_LIKE_THRESHOLD) {
        lastTiltTime = now;
        console.log('[Motion] TILT STRONG RIGHT → MARK_LIKE', gamma.toFixed(1));
        vibrateDouble();
        setStatus('💚 Me gusta');
        socket.emit(EVENTS.MARK_LIKE);
        return;
      }

      // ── MARK_DISLIKE (inclinación fuerte izda en modo tinder) ─────────────
      if (currentMode === 'tinder' && gamma < TILT_DISLIKE_THRESHOLD) {
        lastTiltTime = now;
        console.log('[Motion] TILT STRONG LEFT → MARK_DISLIKE', gamma.toFixed(1));
        vibrateLong();
        setStatus('❤️‍🔥 No me gusta');
        socket.emit(EVENTS.MARK_DISLIKE);
        return;
      }

      // ── NAVIGATE_RIGHT (inclinación dcha moderada) ───────────────────────
      if (currentMode !== 'tinder' && gamma > TILT_LR_THRESHOLD) {
        lastTiltTime = now;
        console.log('[Motion] TILT RIGHT → NAVIGATE_RIGHT', gamma.toFixed(1));
        vibrateShort();
        setStatus('➡️  Navegar derecha');
        socket.emit(EVENTS.NAVIGATE_RIGHT);
        return;
      }

      // ── NAVIGATE_LEFT (inclinación izda moderada) ────────────────────────
      if (currentMode !== 'tinder' && gamma < -TILT_LR_THRESHOLD) {
        lastTiltTime = now;
        console.log('[Motion] TILT LEFT → NAVIGATE_LEFT', gamma.toFixed(1));
        vibrateShort();
        setStatus('⬅️  Navegar izquierda');
        socket.emit(EVENTS.NAVIGATE_LEFT);
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