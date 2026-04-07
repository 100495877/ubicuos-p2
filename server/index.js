const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 1. Servir archivos estáticos desde la carpeta 'public'
// Esto permite que al acceder a la IP del PC se carguen tus interfaces 
app.use(express.static(path.join(__dirname, 'public')));

// 2. Gestión de conexiones con Socket.IO 
io.on('connection', (socket) => {
    console.log('Dispositivo conectado: ' + socket.id);

    // Evento para recibir gestos de la "cartera" (móvil)
    socket.on('gesto-cartera', (data) => {
        console.log('Gesto recibido:', data.accion);
        
        // Reenviar el gesto a todos los demás dispositivos (ej. la pantalla)
        // Esto cumple con el requisito de "comunicación en tiempo real" 
        socket.broadcast.emit('ejecutar-accion', data);
    });

    socket.on('disconnect', () => {
        console.log('Dispositivo desconectado');
    });
});

// 3. Iniciar el servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log(`Para conectar el móvil, usa la IP de tu red local.`);
});