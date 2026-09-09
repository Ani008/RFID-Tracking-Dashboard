/**
 * CR-15 UHF reader adapter — LIVE / first-test build.
 *
 * Based on reverse-engineering the vendor's compiled SDK DLLs (ADSDK.*) that
 * shipped in the CR-06-15-20 RFIDDemo3412 package — there is no public
 * protocol document, so treat the exact byte layout below as "best known
 * guess, confirm against console logs tonight", same spirit as
 * desktop-scanner-adapter.js.
 *
 * ---- What we know for a fact from the SDK DLLs ----
 *   - Transport: USB CDC virtual COM port (Ports/usbser.sys), from the
 *     bundled cdcdriver.inf -> USB\VID_04D8&PID_033F
 *   - Frame format (from ADSDK.Device.Reader.RcpBase constants):
 *       byte 0        : PREAMBLE = 0x7C
 *       byte 1-2      : ADDRESS (2 bytes)
 *       byte 3        : CODE (command/report type, e.g. 0x20 = READ_C_UII)
 *       byte 4        : TYPE  (0x00 CMD, 0x01 RSP, 0x02 NOTI, 0x05 AUTO)
 *       byte 5        : LENGTH (payload length)
 *       byte 6..N     : PAYLOAD (for a tag report, this is the EPC bytes)
 *       byte N+1      : CHECKSUM (XOR-style, exact byte range unconfirmed)
 *   - CODE 0x20 (RCP_CMD_READ_C_UII) is what the SDK uses for an EPC
 *     Gen2/ISO18000-6C tag ID read/report.
 *
 * ---- What is NOT confirmed (verify live tonight) ----
 *   - Baud rate (defaulting to 115200 — the common default for this module
 *     family, but change SCANNER_BAUD if garbage comes through)
 *   - The exact bytes StartAutoRead() sends — we do NOT send a start
 *     command by default. Many of these readers are left in continuous
 *     "auto-report" mode from the last time RFIDDemo.exe used them, so
 *     scanning a tag may just start streaming data with zero setup.
 *   - The exact checksum byte range — checksum validation is OFF by
 *     default (CR15_STRICT_CHECKSUM=false) so you see every candidate
 *     frame while we tune this live, instead of silently dropping frames.
 *
 * HOW TO USE TONIGHT:
 *   1. Wire this into reader-agent/index.js (see snippet at bottom of file)
 *      or run it standalone with `node cr15-adapter.js` to sanity check
 *      before wiring into the full server.
 *   2. Set CR15_PORT=COM5 (or whatever port shows in Device Manager) if
 *      VID/PID auto-detect doesn't find it.
 *   3. Run it, then present a tag to the antenna and watch the console.
 *      - If you see ANY "[cr15] RAW <-" lines: the reader IS sending data,
 *        great — we just need to tune the parser.
 *      - If you see NOTHING at all: check the port/baud, and check nothing
 *        else (RFIDDemo.exe, PuTTY, etc.) has the port open — serial ports
 *        are exclusive.
 */
import { SerialPort } from "serialport";

const TAG = "[cr15]";

const CONFIG = {
  vid: (process.env.CR15_VID || "04d8").toLowerCase().replace(/^0x/, ""),
  pid: (process.env.CR15_PID || "033f").toLowerCase().replace(/^0x/, ""),
  manualPort: process.env.CR15_PORT || null, // e.g. "COM5" or "/dev/ttyACM0"
  baudRate: parseInt(process.env.CR15_BAUD, 10) || 57600,
  gateId: process.env.CR15_GATE_ID || "SHELF_ROOM_DOOR",
  direction: process.env.CR15_DIRECTION || "IN",
  deviceId: process.env.CR15_DEVICE_ID || "cr15-antenna-1",
  strictChecksum:
    (process.env.CR15_STRICT_CHECKSUM || "false").toLowerCase() === "true",
  batchWindowMs: parseInt(process.env.CR15_BATCH_WINDOW_MS, 10) || 1500,
  reconnectDelayMs: 3000,
};

const PREAMBLE = 0x7c;
const CODE_READ_C_UII = 0x20; // RCP_CMD_READ_C_UII — EPC Gen2 tag ID report

/**
 * @param {(payload: { gateId, direction, epcs: string[], deviceId, timestamp }) => Promise<any>} onTagBatch
 */
export function initCr15Adapter(onTagBatch) {
  let port = null;
  let rxBuffer = Buffer.alloc(0);
  let batch = new Set();
  let batchTimer = null;

  connect();

  async function connect() {
    const path = CONFIG.manualPort || (await findPort());
    if (!path) {
      console.error(
        `${TAG} No matching serial device found (VID=0x${CONFIG.vid}, PID=0x${CONFIG.pid}). ` +
          `Set CR15_PORT=COM5 (check Device Manager -> Ports) to bypass auto-detect. ` +
          `Also confirm no other app (RFIDDemo.exe, a terminal) has the port open.`,
      );
      return scheduleReconnect();
    }

    console.log(`${TAG} Opening ${path} at ${CONFIG.baudRate} baud...`);
    port = new SerialPort({ path, baudRate: CONFIG.baudRate, autoOpen: false });

    port.open((err) => {
      if (err) {
        console.error(`${TAG} Failed to open ${path}: ${err.message}`);
        return scheduleReconnect();
      }
      console.log(
        `${TAG} Port open. Waiting for tag data... (present a tag to the antenna now)`,
      );
    });

    port.on("data", (chunk) => {
      console.log(
        `${TAG} RAW <- (${chunk.length}B): ${chunk.toString("hex").toUpperCase()}`,
      );
      rxBuffer = Buffer.concat([rxBuffer, chunk]);
      drainFrames();
    });

    port.on("error", (err) =>
      console.error(`${TAG} Serial error: ${err.message}`),
    );
    port.on("close", () => {
      console.warn(
        `${TAG} Port closed. Reconnecting in ${CONFIG.reconnectDelayMs}ms...`,
      );
      scheduleReconnect();
    });
  }

  async function findPort() {
    const ports = await SerialPort.list();
    console.log(`${TAG} ${ports.length} serial device(s) found:`);
    ports.forEach((p) =>
      console.log(`${TAG}   ${p.path}  VID=${p.vendorId} PID=${p.productId}`),
    );
    const match = ports.find(
      (p) =>
        (p.vendorId || "").toLowerCase() === CONFIG.vid &&
        (p.productId || "").toLowerCase() === CONFIG.pid,
    );
    return match ? match.path : null;
  }

  function drainFrames() {
    // Look for a preamble byte and try to peel off one frame at a time.
    // Minimum frame = preamble(1) + address(2) + code(1) + type(1) + length(1) + checksum(1) = 7 bytes.
    while (true) {
      const start = rxBuffer.indexOf(PREAMBLE);
      if (start === -1) {
        rxBuffer = Buffer.alloc(0);
        return;
      }
      if (start > 0) rxBuffer = rxBuffer.subarray(start); // drop junk before preamble

      if (rxBuffer.length < 7) return; // wait for more data

      const length = rxBuffer[5];
      const frameLen = 6 + length + 1; // header(6) + payload + checksum(1)
      if (rxBuffer.length < frameLen) return; // wait for the rest of this frame

      const frame = rxBuffer.subarray(0, frameLen);
      rxBuffer = rxBuffer.subarray(frameLen);
      handleFrame(frame);
    }
  }

  function handleFrame(frame) {
    const code = frame[3];
    const type = frame[4];
    const length = frame[5];
    const payload = frame.subarray(6, 6 + length);
    const receivedChecksum = frame[6 + length];
    const computedChecksum = checksum(frame.subarray(1, 6 + length));

    const checksumOk = receivedChecksum === computedChecksum;
    console.log(
      `${TAG} Parsed frame: code=0x${code.toString(16)} type=0x${type.toString(16)} ` +
        `len=${length} payload=${payload.toString("hex").toUpperCase()} ` +
        `checksum ${checksumOk ? "OK" : `MISMATCH (got 0x${receivedChecksum.toString(16)}, expected 0x${computedChecksum.toString(16)})`}`,
    );

    if (CONFIG.strictChecksum && !checksumOk) {
      console.warn(
        `${TAG} Dropping frame — checksum mismatch and CR15_STRICT_CHECKSUM=true.`,
      );
      return;
    }

    if (code === CODE_READ_C_UII && length > 0) {
      const epc = payload.toString("hex").toUpperCase();
      console.log(`${TAG} \u2705 Tag detected: EPC=${epc}`);
      queueForBatch(epc);
    }
  }

  function checksum(buf) {
    let sum = 0;

    for (const b of buf) sum = (sum + b) & 0xff;

    return (~sum + 1) & 0xff;
  }

  function queueForBatch(epc) {
    batch.add(epc);
    clearTimeout(batchTimer);
    batchTimer = setTimeout(flushBatch, CONFIG.batchWindowMs);
  }

  async function flushBatch() {
    if (batch.size === 0) return;
    const epcs = [...batch];
    batch = new Set();
    try {
      const result = await onTagBatch({
        gateId: CONFIG.gateId,
        direction: CONFIG.direction,
        epcs,
        deviceId: CONFIG.deviceId,
        timestamp: new Date().toISOString(),
      });
      console.log(
        `${TAG} Batch sent to dashboard pipeline:`,
        epcs,
        "->",
        result?._id || result,
      );
    } catch (err) {
      console.error(`${TAG} Failed to process batch: ${err.message}`);
    }
  }

  function scheduleReconnect() {
    setTimeout(connect, CONFIG.reconnectDelayMs);
  }

  return { mode: "cr15" };
}

// ---- Standalone test mode: `node cr15-adapter.js` ----
// Lets you sanity-check the raw connection WITHOUT needing Mongo/Express
// running yet. Just logs whatever it sees.
if (process.argv[1] && process.argv[1].endsWith("cr15-adapter.js")) {
  initCr15Adapter(async (payload) => {
    console.log(`${TAG} [standalone mode] Would save to DB:`, payload);
    return payload;
  });
}

/* ---- Wiring into your existing server (server.js) ----

import { initCr15Adapter } from './reader-agent/cr15-adapter.js';

// alongside your existing initReaderAgent(app, onTagBatch) call:
initCr15Adapter(onTagBatch);   // onTagBatch is the same callback already defined in server.js

*/
