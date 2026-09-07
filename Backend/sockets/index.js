import { Server } from 'socket.io';

let io = null;

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`[socket] client connected: ${socket.id}`);
    socket.on('disconnect', () => {
      console.log(`[socket] client disconnected: ${socket.id}`);
    });
  });

  return io;
}

/**
 * Emits `movement:new` with the batch summary returned by movementService.
 * Called after every processed batch (mock or real) so the dashboard,
 * Files table, and Court Room Status page can update live.
 */
export function emitMovement(payload) {
  if (!io) {
    console.warn('[socket] emitMovement called before initSocket()');
    return;
  }
  io.emit('movement:new', payload);
}

/**
 * Emits `scanner:tag` whenever the desktop enrollment scanner reads a UID.
 * The Register File page listens for this to auto-fill the RFID Tag field.
 */
export function emitTagScanned(payload) {
  if (!io) {
    console.warn('[socket] emitTagScanned called before initSocket()');
    return;
  }
  io.emit('scanner:tag', payload);
}

export function getIO() {
  return io;
}