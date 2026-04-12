// app/controller/motion.js
//
// MAPA DE GESTOS POR MODO:
//   idle        → shake          : GESTO_SHAKE (→ listening)
//   idle        → tilt adelante  : ENTER_TINDER
//   idle        → tilt atrás     : ENTER_BUDGET
//   idle        → tilt izq/dcha  : TOGGLE_CASH
//
//   listening   → tilt atrás     : CANCEL
//   listening   → resto          : ignorado
//
//   new_expense → tilt adelante  : CONFIRM
//   new_expense → tilt atrás     : CANCEL
//   new_expense → tilt izq/dcha  : REPEAT_CAPTURE
//
//   budget (sin tope previo) → solo voz, tilt atrás = CANCEL
//   budget (con tope previo) → tilt adelante = CONFIRM (aceptar)
//                              tilt izq/dcha = EDIT_BUDGET (editar)
//                              tilt atrás    = CANCEL (salir)
//
//   tinder      → shake          : GESTO_SHAKE
//   tinder      → tilt dcha      : MARK_LIKE
//   tinder      → tilt izq       : MARK_DISLIKE
//   tinder      → tilt atrás     : CANCEL

import {
  EVENTS,
  SHAKE_THRESHOLD, SHAKE_COOLDOWN_MS,
  TILT_LR_THRESHOLD, TILT_FB_THRESHOLD, TILT_BACK_THRESHOLD,
  TILT_COOLDOWN_MS, TILT_DEADZONE, CALIBRATION_SAMPLES,
} from './constants.js';
import { vibrateShort, vibrateDouble, vibrateSuccess, vibrateLong, setStatus } from './feedback.js';

let lastShakeTime     = 0;
let lastTiltTime      = 0;
let tiltForwardActive = false;
let tiltBackActive    = false;
let tiltLeftActive    = false;
let tiltRightActive   = false;
let currentMode       = 'idle';

// Calibración
let betaOffset    = 0;
let gammaOffset   = 0;
let calibrated    = false;
let calibSamples  = [];

export function setCurrentMode(mode) { currentMode = mode; }

// Flag para suprimir setStatus durante la cuenta atrás de calibración
let _calibrating = false;

export function recalibrate() {
  // Resetear estado de calibración
  calibrated    = false;
  calibSamples  = [];
  _calibrating  = true;

  // Resetear todos los flags de tilt para evitar gestos "pegados"
  tiltForwardActive = false;
  tiltBackActive    = false;
  tiltLeftActive    = false;
  tiltRightActive   = false;

  setStatus('🔄 Recalibrando… mantén el móvil quieto en posición normal');
  console.log('[Motion] Recalibración iniciada');
}

export function initMotion(socket) {
  _initShake(socket);
  _initTilt(socket);
}

// ── SHAKE ─────────────────────────────────────────────────────────────────────
function _initShake(socket) {
  const handler = (acc) => {
    if (!acc) return;
    const mag = Math.sqrt((acc.x||0)**2 + (acc.y||0)**2 + (acc.z||0)**2);
    const now = Date.now();
    if (mag > SHAKE_THRESHOLD && now - lastShakeTime > SHAKE_COOLDOWN_MS) {
      if (currentMode === 'idle' || currentMode === 'tinder') {
        console.log('[Motion] SHAKE', mag.toFixed(1));
        vibrateShort(); setStatus('📳 Shake detectado');
        socket.emit(EVENTS.GESTO_SHAKE);
        lastShakeTime = now;
      }
    }
  };

  if (typeof Accelerometer !== 'undefined') {
    try {
      const sensor = new Accelerometer({ frequency: 30 });
      sensor.onerror   = (e) => console.warn('[Motion] Accel error:', e.error?.name);
      sensor.onreading = () => handler({ x: sensor.x, y: sensor.y, z: sensor.z });
      sensor.start(); console.log('[Motion] Accelerometer (API moderna)'); return;
    } catch (e) { console.warn('[Motion] Fallback a DeviceMotionEvent'); }
  }

  const startShake = () => {
    window.addEventListener('devicemotion', (e) => handler(e.accelerationIncludingGravity || e.acceleration));
    console.log('[Motion] DeviceMotionEvent iniciado');
  };
  if (typeof DeviceMotionEvent?.requestPermission === 'function') {
    document.addEventListener('click', async () => {
      const p = await DeviceMotionEvent.requestPermission().catch(() => 'denied');
      if (p === 'granted') startShake();
    }, { once: true });
  } else { startShake(); }
}

// ── TILT con calibración relativa ─────────────────────────────────────────────
function _initTilt(socket) {
  const startTilt = () => {
    window.addEventListener('deviceorientation', (event) => {
      const rawBeta  = event.beta  ?? 0;
      const rawGamma = event.gamma ?? 0;

      // Fase de calibración
      if (!calibrated) {
        calibSamples.push({ beta: rawBeta, gamma: rawGamma });

        // Mostrar cuenta atrás solo cada 10 muestras para no saturar
        if (calibSamples.length % 10 === 0) {
          const rem = Math.ceil((CALIBRATION_SAMPLES - calibSamples.length) / 10);
          if (rem > 0) setStatus(`🔄 Calibrando… (${rem}s)`);
        }

        if (calibSamples.length >= CALIBRATION_SAMPLES) {
          betaOffset  = calibSamples.reduce((s, v) => s + v.beta,  0) / calibSamples.length;
          gammaOffset = calibSamples.reduce((s, v) => s + v.gamma, 0) / calibSamples.length;
          calibrated   = true;
          _calibrating = false;
          calibSamples = [];

          // Resetear también los flags aquí por si el móvil estaba inclinado
          // durante la calibración (los offsets absorben esa inclinación)
          tiltForwardActive = false;
          tiltBackActive    = false;
          tiltLeftActive    = false;
          tiltRightActive   = false;

          console.log(`[Motion] Calibrado β=${betaOffset.toFixed(1)}° γ=${gammaOffset.toFixed(1)}°`);
          vibrateSuccess();
          setStatus('✅ Listo — sacude para registrar un gasto');
        }
        return;
      }

      const beta  = rawBeta  - betaOffset;
      const gamma = rawGamma - gammaOffset;
      const now   = Date.now();

      const inForward  = beta  >  TILT_FB_THRESHOLD;
      const inBack     = beta  < -TILT_BACK_THRESHOLD;
      const inRight    = gamma >  TILT_LR_THRESHOLD;
      const inLeft     = gamma < -TILT_LR_THRESHOLD;
      const inDeadzone = Math.abs(beta) < TILT_DEADZONE && Math.abs(gamma) < TILT_DEADZONE;

      if (!inForward) tiltForwardActive = false;
      if (!inBack)    tiltBackActive    = false;
      if (!inRight)   tiltRightActive   = false;
      if (!inLeft)    tiltLeftActive    = false;

      if (inDeadzone) return;
      if (now - lastTiltTime < TILT_COOLDOWN_MS) return;

      // ── IDLE ──────────────────────────────────────────────────────────────
      if (currentMode === 'idle') {
        if (inForward && !tiltForwardActive) {
          tiltForwardActive = true; lastTiltTime = now;
          console.log(`[Motion] IDLE FWD → ENTER_TINDER`);
          vibrateSuccess(); setStatus('🃏 Entrando en Tinder…');
          socket.emit(EVENTS.ENTER_TINDER); return;
        }
        if (inBack && !tiltBackActive) {
          tiltBackActive = true; lastTiltTime = now;
          console.log(`[Motion] IDLE BACK → ENTER_BUDGET`);
          vibrateShort(); setStatus('💰 Modo tope de gasto…');
          socket.emit(EVENTS.ENTER_BUDGET); return;
        }
        if ((inRight && !tiltRightActive) || (inLeft && !tiltLeftActive)) {
          if (inRight) tiltRightActive = true;
          if (inLeft)  tiltLeftActive  = true;
          lastTiltTime = now;
          console.log(`[Motion] IDLE SIDE → TOGGLE_CASH`);
          vibrateShort(); setStatus('💳 Cambiar método de pago');
          socket.emit(EVENTS.TOGGLE_CASH); return;
        }
        return;
      }

      // ── LISTENING ─────────────────────────────────────────────────────────
      if (currentMode === 'listening') {
        if (inBack && !tiltBackActive) {
          tiltBackActive = true; lastTiltTime = now;
          console.log(`[Motion] LISTENING BACK → CANCEL`);
          vibrateLong(); setStatus('❌ Grabación cancelada');
          socket.emit(EVENTS.CANCEL);
        }
        return;
      }

      // ── NEW_EXPENSE ───────────────────────────────────────────────────────
      if (currentMode === 'new_expense') {
        if (inForward && !tiltForwardActive) {
          tiltForwardActive = true; lastTiltTime = now;
          vibrateSuccess(); setStatus('✅ Confirmando…');
          socket.emit(EVENTS.CONFIRM); return;
        }
        if (inBack && !tiltBackActive) {
          tiltBackActive = true; lastTiltTime = now;
          vibrateLong(); setStatus('❌ Gasto cancelado');
          socket.emit(EVENTS.CANCEL); return;
        }
        if ((inRight && !tiltRightActive) || (inLeft && !tiltLeftActive)) {
          if (inRight) tiltRightActive = true;
          if (inLeft)  tiltLeftActive  = true;
          lastTiltTime = now;
          vibrateDouble(); setStatus('🔄 Repitiendo grabación…');
          socket.emit(EVENTS.REPEAT_CAPTURE); return;
        }
        return;
      }

      // ── BUDGET ────────────────────────────────────────────────────────────
      // No hay CANCEL en budget: solo confirmar o editar.
      if (currentMode === 'budget') {
        if (inForward && !tiltForwardActive) {
          tiltForwardActive = true; lastTiltTime = now;
          console.log(`[Motion] BUDGET FWD → CONFIRM (aceptar tope)`);
          vibrateSuccess(); setStatus('✅ Tope aceptado');
          socket.emit(EVENTS.CONFIRM); return;
        }
        if ((inRight && !tiltRightActive) || (inLeft && !tiltLeftActive)) {
          if (inRight) tiltRightActive = true;
          if (inLeft)  tiltLeftActive  = true;
          lastTiltTime = now;
          console.log(`[Motion] BUDGET SIDE → EDIT_BUDGET`);
          vibrateDouble(); setStatus('✏️ Editando tope…');
          socket.emit(EVENTS.EDIT_BUDGET); return;
        }
        return;
      }

      // ── TINDER ────────────────────────────────────────────────────────────
      if (currentMode === 'tinder') {
        if (inRight && !tiltRightActive) {
          tiltRightActive = true; lastTiltTime = now;
          vibrateDouble(); setStatus('💚 Me gusta');
          socket.emit(EVENTS.MARK_LIKE); return;
        }
        if (inLeft && !tiltLeftActive) {
          tiltLeftActive = true; lastTiltTime = now;
          vibrateLong(); setStatus('❤️‍🔥 No me gusta');
          socket.emit(EVENTS.MARK_DISLIKE); return;
        }
        if (inBack && !tiltBackActive) {
          tiltBackActive = true; lastTiltTime = now;
          vibrateLong(); setStatus('🚪 Saliendo de Tinder');
          socket.emit(EVENTS.CANCEL); return;
        }
        return;
      }
    });
    console.log('[Motion] DeviceOrientationEvent iniciado');
  };

  if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
    document.addEventListener('click', async () => {
      const p = await DeviceOrientationEvent.requestPermission().catch(() => 'denied');
      if (p === 'granted') startTilt();
    }, { once: true });
  } else { startTilt(); }
}
