import { EVENTS, SHAKE_THRESHOLD, SHAKE_COOLDOWN_MS } from "./constants.js";
import { vibrateShort } from "./feedback.js";

let lastShakeTime = 0;

export function initMotion(socket) {
  if ("Accelerometer" in window) {
    try {
      const sensor = new Accelerometer({ frequency: 20 });

      sensor.onerror = (event) => {
        console.error("Error del acelerómetro:", event.error?.name || event);
      };

      sensor.onreading = () => {
        const totalAcc = Math.sqrt(
          (sensor.x || 0) ** 2 +
          (sensor.y || 0) ** 2 +
          (sensor.z || 0) ** 2
        );

        const now = Date.now();

        if (totalAcc > SHAKE_THRESHOLD && now - lastShakeTime > SHAKE_COOLDOWN_MS) {
          lastShakeTime = now;

          console.log("SHAKE detectado:", totalAcc.toFixed(2));
          vibrateShort();
          socket.emit(EVENTS.GESTO_SHAKE);
        }
      };

      sensor.start();
      console.log("Accelerometer iniciado");
      return;
    } catch (error) {
      console.warn("Accelerometer no disponible, usando fallback DeviceMotionEvent:", error);
    }
  }

  window.addEventListener("devicemotion", (event) => {
    const acc = event.accelerationIncludingGravity || event.acceleration;
    if (!acc) return;

    const x = acc.x || 0;
    const y = acc.y || 0;
    const z = acc.z || 0;

    const totalAcc = Math.sqrt(x * x + y * y + z * z);
    const now = Date.now();

    if (totalAcc > SHAKE_THRESHOLD && now - lastShakeTime > SHAKE_COOLDOWN_MS) {
      lastShakeTime = now;

      console.log("SHAKE detectado con fallback:", totalAcc.toFixed(2));
      vibrateShort();
      socket.emit(EVENTS.GESTO_SHAKE);
    }
  });

  console.log("DeviceMotionEvent iniciado");
}