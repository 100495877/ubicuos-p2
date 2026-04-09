// app/controller/socket.js
export const socket = io();

socket.on('connect', () => {
  console.log('[Socket] Conectado al servidor:', socket.id);
});

socket.on('connect_error', (err) => {
  console.error('[Socket] Error de conexión:', err.message);
});

socket.on('disconnect', () => {
  console.warn('[Socket] Desconectado del servidor');
});