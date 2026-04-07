// server/index.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const EVENTS = require('./events');

const app = express();
const server = http.createServer(app);
const io = new Server(server);


// --- 2. ESTADO GLOBAL (En memoria, según el prompt) ---
let listaGastos = [];

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// --- 3. GESTIÓN DE SOCKETS ---
io.on('connection', (socket) => {
    console.log('Nuevo dispositivo conectado:', socket.id);

    // A. Captura de Gesto (Shake detectado en el móvil)
    socket.on('gesto-shake', () => {
        console.log('Gesto SHAKE detectado. Iniciando captura...');
        // Avisamos al móvil que debe empezar a escuchar voz
        socket.emit(EVENTS.START_EXPENSE_CAPTURE);
    });

    // B. Recepción de nuevo gasto (Voz procesada en el móvil)
    socket.on(EVENTS.EXPENSE_CREATED, (nuevoGasto) => {
        console.log('Nuevo gasto recibido:', nuevoGasto);
        
        // Guardar en el estado global
        listaGastos.push(nuevoGasto);
        
        // Notificar a todos (especialmente al Display para que se actualice)
        io.emit('update-display', listaGastos);
        io.emit(EVENTS.EXPENSE_CREATED, nuevoGasto);
    });

    // C. Navegación (Gestos de inclinación/Tilt)
    socket.on(EVENTS.NAVIGATE_LEFT, () => {
        console.log('Navegando a la izquierda');
        socket.broadcast.emit(EVENTS.NAVIGATE_LEFT);
    });

    socket.on(EVENTS.NAVIGATE_RIGHT, () => {
        console.log('Navegando a la derecha');
        socket.broadcast.emit(EVENTS.NAVIGATE_RIGHT);
    });

    // D. Acciones tipo Tinder
    socket.on(EVENTS.MARK_LIKE, (data) => {
        console.log('Gasto marcado como LIKE');
        socket.broadcast.emit(EVENTS.MARK_LIKE, data);
    });

    socket.on(EVENTS.MARK_DISLIKE, (data) => {
        console.log('Gasto marcado como DISLIKE');
        socket.broadcast.emit(EVENTS.MARK_DISLIKE, data);
    });

    socket.on('disconnect', () => {
        console.log('Dispositivo desconectado');
    });
});

// --- 4. INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n--- Servidor de Cartera Inteligente ---`);
    console.log(`Corriendo en: http://localhost:${PORT}`);
    console.log(`Usa la IP de tu PC para conectar el móvil en la misma red.`);
});