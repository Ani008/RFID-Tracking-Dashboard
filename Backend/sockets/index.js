import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { JWT_SECRET } from '../middleware/auth.js';

let io = null;

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Socket.io Authentication Middleware
  // Re-verified on initial connect and every reconnection attempt
  io.use(async (socket, next) => {
    try {
      const authHeader = socket.handshake.headers?.authorization;
      const token =
        socket.handshake.auth?.token ||
        (authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);

      if (!token) {
        return next(new Error('Authentication required: No JWT token provided in socket handshake'));
      }

      let decoded;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (err) {
        return next(new Error('Invalid or expired JWT token on socket handshake'));
      }

      const user = await User.findById(decoded.userId).select('username role active');
      if (!user) {
        return next(new Error('User account associated with token no longer exists'));
      }

      if (!user.active) {
        return next(new Error('User account has been deactivated'));
      }

      socket.user = {
        userId: user._id,
        username: user.username,
        role: user.role,
      };

      next();
    } catch (err) {
      next(new Error(`Socket authentication error: ${err.message}`));
    }
  });

  io.on('connection', (socket) => {
    console.log(`[socket] authenticated client connected: ${socket.id} (user: @${socket.user?.username}, role: ${socket.user?.role})`);
    socket.on('disconnect', (reason) => {
      console.log(`[socket] client disconnected: ${socket.id} (${reason})`);
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

export function getIO() {
  return io;
}
