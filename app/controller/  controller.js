import { socket } from "./socket.js";
import { initMotion } from "./motion.js";
import { EVENTS } from "./constants.js";
import { vibrateDouble } from "./feedback.js";

window.addEventListener("load", () => {
  console.log("Controller cargado");
  initMotion(socket);

  socket.on(EVENTS.START_EXPENSE_CAPTURE, () => {
    console.log("Servidor ha pedido iniciar captura de gasto");
    vibrateDouble();

    // Aquí luego meteremos voice.js
  });
});