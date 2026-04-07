export const socket = io();

socket.on("connect", () => {
  console.log("Conectado al servidor:", socket.id);
});

socket.on("connect_error", (err) => {
  console.error("Error de conexión:", err.message);
});