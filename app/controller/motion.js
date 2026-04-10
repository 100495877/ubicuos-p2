// app/controller/motion.js
//
// CALIBRACIÓN RELATIVA:
//   Los ángulos de DeviceOrientationEvent son absolutos y varían entre
//   dispositivos y sesiones. Este módulo captura la posición de reposo
//   inicial como "cero" y mide todos los gestos como desviaciones relativas.
//
// MAPA DE GESTOS POR MODO:
//   idle        → shake          : GESTO_SHAKE (→ listening)
//   idle        → tilt adelante  : ENTER_TINDER
//   idle        → tilt izq/dcha  : TOGGLE_CASH
//   idle        → tilt atrás     : (ignorado)
//
//   listening   → tilt atrás     : CANCEL
//   listening   → resto          : (ignorado)
//
//   new_expense → tilt adelante  : CONFIRM
//   new_expense → tilt atrás     : CANCEL
//   new_expense → tilt izq/dcha  : REPEAT_CAPTURE
//
//   tinder      → shake          : GESTO_SHAKE (→ listening)
//   tinder      → tilt dcha      : MARK_LIKE
//   tinder      → tilt izq       : MARK_DISLIKE
//   tinder      → tilt atrás     : CANCEL (salir → idle)
//   tinder      → tilt adelante  : (ignorado)

import {
  EVENTS,
  SHAKE_THRESHOLD, SHAKE_COOLDOWN_MS,
  TILT_LR_THRESHOLD, TILT_FB_THRESHOLD, TILT_BACK_THRESHOLD,
  TILT_COOLDOWN_MS, TILT_DEADZONE,
  CALIBRATION_SAMPLES,
} from './constants.js';
import {
  vibrateShort, vibrateDouble, vibrateSuccess, vibrateLong, setStatus,
} from './feedback.js';

// ── Estado interno ────────────────────────────────────────────────────────────
let lastShakeTime     = 0;
let lastTiltTime      = 0;
let tiltForwardActive = false;
let tiltBackActive    = false;
let tiltLeftActive    = false;
let tiltRightActive   = false;
let currentMode       = 'idle';

// ── Calibración ───────────────────────────────────────────────────────────────
let betaOffset        = 0;   // posición de reposo en beta  (adelante/atrás)
let gammaOffset       = 0;   // posición de reposo en gamma (izq/dcha)
let calibrated        = false;
let calibSamples      = [];  // acumulador de muestras durante la calibración

export function setCurrentMode(mode) { currentMode = mode; }

// Llamada externamente (botón de recalibrar en index.html)
export function recalibrate() {
  calibrated   = false;
  calibSamples = [];
  setStatus('🔄 Recalibrando… mantén el móvil en posición normal');
  console.log('[Motion] Recalibración iniciada');
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
      if (currentMode === 'idle' || currentMode === 'tinder') {
        console.log('[Motion] SHAKE →', mag.toFixed(1));
        vibrateShort();
        setStatus('📳 Shake detectado');
        socket.emit(EVENTS.GESTO_SHAKE);
        lastShakeTime = now;
      }
    }
  };

  if (typeof Accelerometer !== 'undefined') {
    try {
      const sensor = new Accelerometer({ frequency: 30 });
      sensor.onerror  = (e) => console.warn('[Motion] Accelerometer error:', e.error?.name);
      sensor.onreading = () => handler({ x: sensor.x, y: sensor.y, z: sensor.z });
      sensor.start();
      console.log('[Motion] Accelerometer iniciado (API moderna)');
      return;
    } catch (e) {
      console.warn('[Motion] Fallback a DeviceMotionEvent');
    }
  }

  const startShake = () => {
    window.addEventListener('devicemotion', (e) => {
      handler(e.accelerationIncludingGravity || e.acceleration);
    });
    console.log('[Motion] DeviceMotionEvent iniciado');
  };

  if (typeof DeviceMotionEvent?.requestPermission === 'function') {
    document.addEventListener('click', async () => {
      const perm = await DeviceMotionEvent.requestPermission().catch(() => 'denied');
      if (perm === 'granted') startShake();
    }, { once: true });
  } else {
    startShake();
  }
}

// ── TILT con calibración relativa ─────────────────────────────────────────────
function _initTilt(socket) {
  const startTilt = () => {
    window.addEventListener('deviceorientation', (event) => {
      const rawBeta  = event.beta  ?? 0;
      const rawGamma = event.gamma ?? 0;

      // ── FASE DE CALIBRACIÓN ──────────────────────────────────────────────
      if (!calibrated) {
        calibSamples.push({ beta: rawBeta, gamma: rawGamma });

        // Mostrar progreso cada 10 muestras
        if (calibSamples.length % 10 === 0) {
          const remaining = Math.ceil((CALIBRATION_SAMPLES - calibSamples.length) / 10);
          setStatus(`🔄 Calibrando sensores… (${remaining}s)`);
        }

        if (calibSamples.length >= CALIBRATION_SAMPLES) {
          // Calcular media como posición de referencia
          betaOffset  = calibSamples.reduce((s, v) => s + v.beta,  0) / calibSamples.length;
          gammaOffset = calibSamples.reduce((s, v) => s + v.gamma, 0) / calibSamples.length;
          calibrated  = true;
          calibSamples = [];
          console.log(`[Motion] Calibrado — betaOffset: ${betaOffset.toFixed(1)}°, gammaOffset: ${gammaOffset.toFixed(1)}°`);
          vibrateSuccess();
          setStatus('✅ Listo — sacude para registrar un gasto');
        }
        return; // no procesar gestos hasta estar calibrado
      }

      // ── ÁNGULOS RELATIVOS (desviación desde la posición de reposo) ───────
      const beta  = rawBeta  - betaOffset;
      const gamma = rawGamma - gammaOffset;
      const now   = Date.now();

      // Zonas de activación (con zona muerta en el centro)
      const inForward = beta  >  TILT_FB_THRESHOLD;
      const inBack    = beta  < -TILT_BACK_THRESHOLD;  // TILT_BACK_THRESHOLD es positivo en constants
      const inRight   = gamma >  TILT_LR_THRESHOLD;
      const inLeft    = gamma < -TILT_LR_THRESHOLD;

      // Zona muerta: ninguna zona activa
      const inDeadzone = Math.abs(beta) < TILT_DEADZONE && Math.abs(gamma) < TILT_DEADZONE;

      // Resetear flags cuando el dispositivo vuelve a zona neutra
      if (!inForward) tiltForwardActive = false;
      if (!inBack)    tiltBackActive    = false;
      if (!inRight)   tiltRightActive   = false;
      if (!inLeft)    tiltLeftActive    = false;

      // No procesar nada mientras esté en zona muerta o en cooldown
      if (inDeadzone) return;
      if (now - lastTiltTime < TILT_COOLDOWN_MS) return;

      // ── IDLE ──────────────────────────────────────────────────────────────
      if (currentMode === 'idle') {
        if (inForward && !tiltForwardActive) {
          tiltForwardActive = true; lastTiltTime = now;
          console.log(`[Motion] IDLE TILT FWD → ENTER_TINDER (β=${beta.toFixed(1)}°)`);
          vibrateSuccess(); setStatus('🃏 Entrando en Tinder…');
          socket.emit(EVENTS.ENTER_TINDER);
          return;
        }
        if ((inRight && !tiltRightActive) || (inLeft && !tiltLeftActive)) {
          if (inRight) tiltRightActive = true;
          if (inLeft)  tiltLeftActive  = true;
          lastTiltTime = now;
          console.log(`[Motion] IDLE TILT SIDE → TOGGLE_CASH (γ=${gamma.toFixed(1)}°)`);
          vibrateShort(); setStatus('💳 Cambiar método de pago');
          socket.emit(EVENTS.TOGGLE_CASH);
          return;
        }
        return; // tilt atrás ignorado en idle
      }

      // ── LISTENING ─────────────────────────────────────────────────────────
      if (currentMode === 'listening') {
        if (inBack && !tiltBackActive) {
          tiltBackActive = true; lastTiltTime = now;
          console.log(`[Motion] LISTENING TILT BACK → CANCEL (β=${beta.toFixed(1)}°)`);
          vibrateLong(); setStatus('❌ Grabación cancelada');
          socket.emit(EVENTS.CANCEL);
          return;
        }
        return; // resto ignorado
      }

      // ── NEW_EXPENSE ───────────────────────────────────────────────────────
      if (currentMode === 'new_expense') {
        if (inForward && !tiltForwardActive) {
          tiltForwardActive = true; lastTiltTime = now;
          console.log(`[Motion] NEW_EXPENSE TILT FWD → CONFIRM (β=${beta.toFixed(1)}°)`);
          vibrateSuccess(); setStatus('✅ Confirmando gasto…');
          socket.emit(EVENTS.CONFIRM);
          return;
        }
        if (inBack && !tiltBackActive) {
          tiltBackActive = true; lastTiltTime = now;
          console.log(`[Motion] NEW_EXPENSE TILT BACK → CANCEL (β=${beta.toFixed(1)}°)`);
          vibrateLong(); setStatus('❌ Gasto cancelado');
          socket.emit(EVENTS.CANCEL);
          return;
        }
        if ((inRight && !tiltRightActive) || (inLeft && !tiltLeftActive)) {
          if (inRight) tiltRightActive = true;
          if (inLeft)  tiltLeftActive  = true;
          lastTiltTime = now;
          console.log(`[Motion] NEW_EXPENSE TILT SIDE → REPEAT (γ=${gamma.toFixed(1)}°)`);
          vibrateDouble(); setStatus('🔄 Repitiendo grabación…');
          socket.emit(EVENTS.REPEAT_CAPTURE);
          return;
        }
        return;
      }

      // ── TINDER ────────────────────────────────────────────────────────────
      if (currentMode === 'tinder') {
        if (inRight && !tiltRightActive) {
          tiltRightActive = true; lastTiltTime = now;
          console.log(`[Motion] TINDER TILT RIGHT → MARK_LIKE (γ=${gamma.toFixed(1)}°)`);
          vibrateDouble(); setStatus('💚 Me gusta');
          socket.emit(EVENTS.MARK_LIKE);
          return;
        }
        if (inLeft && !tiltLeftActive) {
          tiltLeftActive = true; lastTiltTime = now;
          console.log(`[Motion] TINDER TILT LEFT → MARK_DISLIKE (γ=${gamma.toFixed(1)}°)`);
          vibrateLong(); setStatus('❤️‍🔥 No me gusta');
          socket.emit(EVENTS.MARK_DISLIKE);
          return;
        }
        if (inBack && !tiltBackActive) {
          tiltBackActive = true; lastTiltTime = now;
          console.log(`[Motion] TINDER TILT BACK → CANCEL (β=${beta.toFixed(1)}°)`);
          vibrateLong(); setStatus('🚪 Saliendo de Tinder');
          socket.emit(EVENTS.CANCEL);
          return;
        }
        return; // tilt adelante ignorado en tinder
      }
    });
    console.log('[Motion] DeviceOrientationEvent iniciado');
  };

  if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
    document.addEventListener('click', async () => {
      const perm = await DeviceOrientationEvent.requestPermission().catch(() => 'denied');
      if (perm === 'granted') startTilt();
    }, { once: true });
  } else {
    startTilt();
  }
}