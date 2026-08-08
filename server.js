import express, { static as staticMiddleware } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { existsSync } from 'fs';
import { resolve } from 'path';

const app = express();
const server = createServer(app);
const io = new Server(server);

// Serve built frontend in production, or static public/ in dev
const distPath = resolve('dist');
if (existsSync(distPath)) {
    app.use(staticMiddleware(distPath));
} else {
    app.use(staticMiddleware('public'));
}

// --- TURN Server Config Endpoint ---
// Clients fetch this on startup to get ICE server config.
// Configure via environment variables for production.
app.get('/api/ice-config', (req, res) => {
    const iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ];

    // If TURN credentials are provided via env, include TURN servers
    const turnUrl = process.env.TURN_URL;
    const turnUser = process.env.TURN_USERNAME;
    const turnPass = process.env.TURN_CREDENTIAL;

    if (turnUrl && turnUser && turnPass) {
        iceServers.push({
            urls: turnUrl,
            username: turnUser,
            credential: turnPass,
        });
        console.log('🔄 TURN server configured');
    }

    res.json({ iceServers });
});

// --- Socket.IO Signaling ---
io.on('connection', (socket) => {
    console.log(`🟢 New connection: ${socket.id}`);

    // Discovery — join room
    socket.on('join-room', (roomCode) => {
        socket.join(roomCode);
        socket.roomId = roomCode;

        console.log(`👤 User ${socket.id} joined Room: ${roomCode}`);

        // Notify others
        socket.to(roomCode).emit('user-joined', socket.id);
    });

    // WebRTC Signaling
    socket.on('send-offer', (data) => {
        socket.to(socket.roomId).emit('receive-offer', data);
    });

    socket.on('send-answer', (data) => {
        socket.to(socket.roomId).emit('receive-answer', data);
    });

    socket.on('send-ice-candidate', (data) => {
        socket.to(socket.roomId).emit('receive-ice-candidate', data);
    });



    socket.on('disconnect', () => {
        console.log(`🔴 Disconnected: ${socket.id}`);
        if (socket.roomId) {
            socket.to(socket.roomId).emit('user-left', socket.id);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 FileShare Signaling Server running on http://localhost:${PORT}`);
});