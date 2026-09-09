/**
 * Two ways to reach the door reader — your team confirmed BOTH work with the
 * vendor's own demo app (USB/serial and LAN). The byte protocol (protocol.js)
 * is identical either way; only how the bytes get there differs. This module
 * gives real-adapter.js one uniform interface over either transport.
 */
import { SerialPort } from 'serialport';
import net from 'net';

/**
 * @param {{ path: string, baudRate: number }} cfg
 */
export function createSerialTransport({ path, baudRate }) {
  const port = new SerialPort({ path, baudRate, autoOpen: false });
  return {
    open: (cb) => port.open(cb),
    write: (buf, cb) => port.write(buf, cb),
    onData: (fn) => port.on('data', fn),
    onError: (fn) => port.on('error', fn),
    onClose: (fn) => port.on('close', fn),
    close: () => {
      if (port.isOpen) port.close();
    },
    describe: () => `serial ${path}@${baudRate}`,
  };
}

/**
 * @param {{ host: string, port: number, connectTimeoutMs?: number }} cfg
 */
export function createTcpTransport({ host, port: tcpPort, connectTimeoutMs = 5000 }) {
  const socket = new net.Socket();
  let opened = false;
  let connectTimer = null;

  return {
    open: (cb) => {
      socket.once('error', (err) => {
        if (!opened) {
          clearTimeout(connectTimer);
          cb(err); // only forward connect-time errors here; onError below handles the rest
        }
      });

      // net.Socket has no built-in connect timeout — without this, a wrong
      // IP or a reader that's on a different subnet just hangs forever
      // instead of failing fast.
      connectTimer = setTimeout(() => {
        if (!opened) {
          socket.destroy();
          cb(
            new Error(
              `connection to ${host}:${tcpPort} timed out after ${connectTimeoutMs}ms — check the IP/port and that this machine and the reader are on the same network`
            )
          );
        }
      }, connectTimeoutMs);

      socket.connect(tcpPort, host, () => {
        opened = true;
        clearTimeout(connectTimer);
        socket.setNoDelay(true); // tag-read frames are small; don't let Nagle's algorithm delay them
        socket.setKeepAlive(true, 10000); // detect a dead link (reader power-cycled, cable pulled) instead of hanging silently
        cb(null);
      });
    },
    write: (buf, cb) => socket.write(buf, cb),
    onData: (fn) => socket.on('data', fn),
    onError: (fn) => socket.on('error', fn),
    onClose: (fn) => socket.on('close', fn),
    close: () => {
      clearTimeout(connectTimer);
      socket.destroy();
    },
    describe: () => `tcp ${host}:${tcpPort}`,
  };
}