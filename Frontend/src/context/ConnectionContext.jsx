import { createContext, useContext } from 'react';
import { useMovementSocket } from '../hooks/useMovementSocket.js';

const ConnectionContext = createContext({ isConnected: false, lastMovement: null });

export function ConnectionProvider({ children }) {
  const { isConnected, lastMovement } = useMovementSocket();
  return (
    <ConnectionContext.Provider value={{ isConnected, lastMovement }}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection() {
  return useContext(ConnectionContext);
}
