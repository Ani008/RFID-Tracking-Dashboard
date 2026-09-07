import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

/**
 * Opens an authenticated socket connection using the active JWT token.
 * Listens for `movement:new` events and updates real-time state.
 */
export function useMovementSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMovement, setLastMovement] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('rfid_auth_token');
    if (!token) {
      setIsConnected(false);
      return;
    }

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.warn('[socket] Connection error / auth failure:', err.message);
      setIsConnected(false);
    });

    socket.on('movement:new', (payload) => {
      setLastMovement(payload);
    });

    // Listen for auth logout event to disconnect cleanly
    const handleLogout = () => {
      if (socket) socket.disconnect();
    };
    window.addEventListener('auth:unauthorized', handleLogout);

    return () => {
      window.removeEventListener('auth:unauthorized', handleLogout);
      socket.disconnect();
    };
  }, []);

  return { isConnected, lastMovement };
}
