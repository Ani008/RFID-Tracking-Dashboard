import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getSocketUrl } from '../utils/apiConfig.js';

const SOCKET_URL = getSocketUrl();

/**
 * Opens one shared socket connection and listens for `scanner:tag`, emitted
 * by the backend's desktop-scanner-adapter whenever the RFG-WD01 reads a UID.
 *
 * isConnected here reflects the SOCKET connection (frontend <-> backend),
 * not whether the physical scanner is plugged in — the backend logs that
 * separately (see desktop-scanner-adapter.js console output).
 */
export function useScannerSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastTag, setLastTag] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('connect_error', () => setIsConnected(false));

    socket.on('scanner:tag', (payload) => {
      setLastTag(payload);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return { isConnected, lastTag };
}