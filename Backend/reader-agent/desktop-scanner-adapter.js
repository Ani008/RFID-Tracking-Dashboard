/**
 * Desktop enrollment scanner adapter — Megawin RFG-WD01 (USB EasyPOD family).
 *
 * This is DIFFERENT from real-adapter.js: that file is for the fixed door
 * antennas (in/out gate movement) which we don't have yet. This file is for
 * the desktop scanner used to READ A TAG'S UID and hand it to the "Register
 * File" form — no gate, no direction, no antenna involved.
 *
 * ---- What we know for a fact from the vendor SDK/driver files ----
 *   - Device:      Megawin RFG-WD01
 *   - USB ID:      VID 0x0E6A, PID 0x0316   (from the driver .inf)
 *   - Transport:   Virtual COM port (Class = Ports, usbser.sys) — confirmed
 *                  by the driver .inf AND by strings inside RFG-WD01.exe
 *                  referencing HARDWARE\DEVICEMAP\SERIALCOMM.
 *   - Baud/frame:  115200, 8 data bits, no parity, 1 stop bit
 *                  (found as the literal string "115200,n,8,1" in RFG-WD01.exe)
 *   - Protocol:    Vendor's own C# example (btnGetUID_Click) sends the 2-byte
 *                  command {0x02, 0x01} = {STX, CMD_GET_UID}, then reads a
 *                  response where the UID bytes start at offset 4.
 *
 * ---- What is NOT confirmed yet (needs tomorrow's hardware to verify) ----
 *   - The exact byte layout of "no tag present" vs "tag present" responses.
 *   - Whether the reader also has an unsolicited "auto read" push mode.
 *   - Whether PID 0x0316 (RFG-WD01) replies to {0x02,0x01} exactly like the
 *     PID 0x0317 unit in Megawin's own example — same vendor/DLL family, but
 *     not the identical model, so treat this as "best known guess, verify
 *     against console logs tomorrow", not gospel.
 *
 * We poll for a UID every SCANNER_POLL_INTERVAL_MS instead of assuming an
 * auto-push mode, since that's guaranteed to work with a simple
 * request/response reader regardless of which mode it boots into.
 *
 * IMPORTANT GOTCHA: serial ports are exclusive. If Megawin's own RFG-WD01.exe
 * (or any other terminal app) has the port open, this adapter's open() call
 * will fail with a "port busy / access denied" style error. Close their demo
 * app first.
 */
import { SerialPort } from 'serialport';
import { normalizeRfidTag } from '../utils/rfidHelper.js';

const TAG = '[scanner]';

const CONFIG = {
  mode: (process.env.DESKTOPSCANNER || 'local').toLowerCase(), // 'local' | 'production'
  vid: (process.env.SCANNER_VID || '0e6a').toLowerCase().replace(/^0x/, ''),
  pid: (process.env.SCANNER_PID || '0316').toLowerCase().replace(/^0x/, ''),
  baudRate: parseInt(process.env.SCANNER_BAUD, 10) || 115200,
  manualPort: process.env.SCANNER_PORT || null, // e.g. "COM5" or "/dev/ttyUSB0" — bypasses VID/PID auto-detect
  pollIntervalMs: parseInt(process.env.SCANNER_POLL_INTERVAL_MS, 10) || 400,
  reconnectDelayMs: parseInt(process.env.SCANNER_RECONNECT_DELAY_MS, 10) || 3000,
  readTimeoutMs: parseInt(process.env.SCANNER_READ_TIMEOUT_MS, 10) || 500,
  reScanCooldownMs: parseInt(process.env.SCANNER_RESCAN_COOLDOWN_MS, 10) || 5000,
};

// STX + CMD(0x01 = Get UID), per Megawin's own EasyPOD example code.
const GET_UID_CMD = Buffer.from([0x02, 0x01]);

/**
 * @param {(payload: { uid: string, deviceId: string, timestamp: string, raw: string }) => void} onTagScanned
 * @returns {{ mode: string, close: () => void }}
 */
export function initDesktopScanner(onTagScanned) {
  console.log(`${TAG} DESKTOPSCANNER=${CONFIG.mode}`);

  if (CONFIG.mode !== 'production') {
    console.log(
      `${TAG} Running in LOCAL mode — no hardware will be touched. ` +
        `Type/paste the EPC manually in the Register File form. ` +
        `Set DESKTOPSCANNER=production to switch to live hardware.`
    );
    return { mode: 'local', close: () => {} };
  }

  console.log(
    `${TAG} Running in PRODUCTION mode — looking for a scanner ` +
      `(VID=0x${CONFIG.vid}, PID=0x${CONFIG.pid})${CONFIG.manualPort ? `, forced port=${CONFIG.manualPort}` : ''}`
  );

  let port = null;
  let pollTimer = null;
  let reconnectTimer = null;
  let closedByUs = false;
  let lastUid = null;
  let lastSeenAt = 0;

  connect();

  async function connect() {
    try {
      const path = CONFIG.manualPort || (await findScannerPort());
      if (!path) {
        console.error(
          `${TAG} No matching serial device found (VID=0x${CONFIG.vid}, PID=0x${CONFIG.pid}). ` +
            `Checklist: is the scanner plugged in? Is the Megawin USB EasyCOM driver installed ` +
            `(Device Manager -> Ports (COM & LPT))? Is another app (RFG-WD01.exe) already holding the port open?`
        );
        scheduleReconnect();
        return;
      }

      console.log(`${TAG} Found target device on ${path}. Opening at ${CONFIG.baudRate} baud...`);

      port = new SerialPort({ path, baudRate: CONFIG.baudRate, autoOpen: false });

      port.open((err) => {
        if (err) {
          console.error(`${TAG} Failed to open ${path}: ${err.message}`);
          console.error(
            `${TAG} If this says "Access denied" / "port busy", close Megawin's own RFG-WD01.exe ` +
              `or any other terminal program using this port, then it will retry automatically.`
          );
          scheduleReconnect();
          return;
        }
        console.log(`${TAG} Port ${path} opened successfully.`);
        console.log(`${TAG} Scanner connected \u2705 — polling for tags every ${CONFIG.pollIntervalMs}ms`);
        startPolling();
      });

      port.on('error', (err) => {
        console.error(`${TAG} Serial port error: ${err.message}`);
      });

      port.on('close', () => {
        stopPolling();
        if (!closedByUs) {
          console.warn(`${TAG} Scanner disconnected unexpectedly. Will retry in ${CONFIG.reconnectDelayMs}ms.`);
          scheduleReconnect();
        } else {
          console.log(`${TAG} Port closed.`);
        }
      });
    } catch (err) {
      console.error(`${TAG} Unexpected error while connecting: ${err.message}`);
      scheduleReconnect();
    }
  }

  async function findScannerPort() {
    const ports = await SerialPort.list();
    console.log(`${TAG} Found ${ports.length} serial device(s) on this machine.`);
    const match = ports.find(
      (p) =>
        (p.vendorId || '').toLowerCase() === CONFIG.vid && (p.productId || '').toLowerCase() === CONFIG.pid
    );
    return match ? match.path : null;
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(pollOnce, CONFIG.pollIntervalMs);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  function pollOnce() {
    if (!port || !port.isOpen) return;

    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      // No response within the window = no tag currently on the reader.
      // Reset lastUid so the same tag can be scanned again once presented.
      lastUid = null;
    }, CONFIG.readTimeoutMs);

    const onData = (chunk) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      port.off('data', onData);
      handleResponse(chunk);
    };

    port.on('data', onData);

    port.write(GET_UID_CMD, (err) => {
      if (err) {
        console.error(`${TAG} Write error while polling: ${err.message}`);
      }
    });
  }

  function handleResponse(chunk) {
    // Per Megawin's own example: UID bytes start at offset 4 in the response.
    // NOTE: exact framing for RFG-WD01 needs verifying live tomorrow — this
    // console.log is left verbose on purpose so we can see raw bytes and
    // adjust the offset/length quickly if the real device differs.
    console.log(`${TAG} Raw response (${chunk.length} bytes): ${chunk.toString('hex').toUpperCase()}`);

    if (chunk.length <= 4) {
      // Too short to contain a UID — treat as "no tag" and allow re-scan.
      lastUid = null;
      return;
    }

    const rawUid = chunk.subarray(4).toString('hex').toUpperCase();
    const uid = normalizeRfidTag(rawUid);
    const now = Date.now();

    const isSameTagStillDown = uid === lastUid && now - lastSeenAt < CONFIG.reScanCooldownMs;
    lastSeenAt = now;
    lastUid = uid;

    if (isSameTagStillDown) {
      // Same tag still sitting on the reader — don't spam the frontend.
      return;
    }

    console.log(`${TAG} Tag scanned: ${uid} (raw: ${rawUid})`);
    onTagScanned({
      uid,
      rawUid,
      deviceId: 'rfg-wd01-desktop-scanner',
      timestamp: new Date().toISOString(),
      raw: chunk.toString('hex').toUpperCase(),
    });
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, CONFIG.reconnectDelayMs);
  }

  function close() {
    closedByUs = true;
    stopPolling();
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (port && port.isOpen) port.close();
  }

  return { mode: 'production', close };
}