import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

/**
 * Opens one shared socket connection and listens for `movement:new`.
 * Returns the latest movement payload (batch summary) and connection state.
 */
export function useMovementSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMovement, setLastMovement] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('connect_error', () => setIsConnected(false));

    socket.on('movement:new', (payload) => {
      setLastMovement(payload);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return { isConnected, lastMovement };
}
