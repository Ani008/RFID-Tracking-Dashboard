/**
 * Dynamically resolves the API and WebSocket URLs based on the current window location.
 * This guarantees seamless connectivity whether accessed via:
 * - http://localhost:5173
 * - http://127.0.0.1:5173
 * - http://192.168.x.x:5173 (Handheld / mobile WiFi)
 * - http://172.x.x.x:5173 (Hotspot)
 */

export function getApiBaseUrl() {
  if (typeof window !== 'undefined' && window.location) {
    const { hostname, protocol } = window.location;
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      /^10\./.test(hostname)
    ) {
      return `${protocol}//${hostname}:4000/api`;
    }
  }
  return import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
}

export function getSocketUrl() {
  if (typeof window !== 'undefined' && window.location) {
    const { hostname, protocol } = window.location;
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      /^10\./.test(hostname)
    ) {
      return `${protocol}//${hostname}:4000`;
    }
  }
  return import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';
}
