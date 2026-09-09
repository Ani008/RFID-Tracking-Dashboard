/**
 * Fixed door/gate antenna reader integration — implements the "MM Version
 * Reader Control Protocol v1.2" that your door reader speaks (see
 * protocol.js for the byte-level framing).
 *
 * Same contract as mock-adapter.js: every parsed tag read eventually calls
 * `onTagBatch({ gateId, direction, epcs, deviceId, timestamp })`, so nothing
 * downstream (movementService, sockets, frontend) needs to know this isn't
 * the simulator.
 *
 * ---- What's confirmed ----
 *   - Reader connects via USB (virtual COM/RS232) AND LAN — both tested
 *     with the vendor's own app (beep + tag count). Same byte protocol
 *     either way; only the transport differs (see transports.js).
 *   - Protocol default baud is 57600 (spec section 1).
 *
 * ---- What is NOT confirmed yet (only one antenna on hand right now) ----
 *   - Whether the reader boots into Active (auto-report) mode by default,
 *     or Command mode (needs the Set Base Parameters call below to switch
 *     it). This adapter sends Set Base Parameters on every connect to force
 *     Active mode — harmless either way, just confirms the setting.
 *   - Antenna-to-direction mapping: with only 1 antenna, you can prove the
 *     read -> dashboard pipeline works end-to-end, but you can't yet prove
 *     real "IN vs OUT" detection — that needs a 2nd antenna (or 2nd reader)
 *     at the same doorway. See ANTENNA MAPPING below.
 *   - The exact meaning of the OM (output mode) byte over a LAN connection.
 *     Left at 0x00 since it's about the reader's *own* auto-output port,
 *     not which cable we happen to be reading this control channel over —
 *     verify nothing changes when you flip it if tag reads don't show up.
 *
 * ---- ANTENNA MAPPING ----
 * Real gate detection needs to know which physical antenna saw the tag.
 * Configure this per reader via RFID_READERS (see .env.example) or the
 * simpler READER_* vars below. Today, with 1 antenna, map it to a single
 * fixed direction on one gate just to prove the pipeline works:
 *   READER_ANTENNA_MAP={"1":"OUT"}
 * When a 2nd antenna/reader for the same doorway arrives, add antenna "2"
 * (typically the OUT side) so direction comes from which antenna fired,
 * not a guess.
 */
import { createSerialTransport, createTcpTransport } from './transport.js';
import { buildCommand, createFrameParser, parseTagFrame, CID1, CID2 } from './protocol.js';

const TAG = '[real-adapter]';
const BATCH_WINDOW_MS = parseInt(process.env.READER_BATCH_WINDOW_MS, 10) || 1500;

function loadReaderConfigs() {
  // Multi-reader setups (once the 2nd door's hardware arrives) can be
  // configured with a single JSON env var instead of juggling many
  // separate vars:
  //   RFID_READERS=[{"id":"shelf-reader","gateId":"SHELF_ROOM_DOOR",
  //     "transport":"tcp","host":"192.168.1.190","port":4001,
  //     "antennaMap":{"1":"OUT","2":"IN"}}, { ... second reader ... }]
  if (process.env.RFID_READERS) {
    try {
      return JSON.parse(process.env.RFID_READERS);
    } catch (err) {
      console.error(`${TAG} RFID_READERS is not valid JSON, ignoring: ${err.message}`);
    }
  }

  // Fallback: a single reader from plain env vars — what you want right
  // now, with one antenna connected either via USB or LAN.
  const transport = (process.env.READER_TRANSPORT || 'serial').toLowerCase();
  let antennaMap = { 1: 'OUT' };
  if (process.env.READER_ANTENNA_MAP) {
    try {
      antennaMap = JSON.parse(process.env.READER_ANTENNA_MAP);
    } catch (err) {
      console.error(`${TAG} READER_ANTENNA_MAP is not valid JSON, using default {"1":"OUT"}: ${err.message}`);
    }
  }

  return [
    {
      id: process.env.READER_ID || 'reader-1',
      gateId: process.env.READER_GATE_ID || 'SHELF_ROOM_DOOR',
      transport,
      path: process.env.READER_PORT || 'COM5',
      baudRate: parseInt(process.env.READER_BAUD, 10) || 57600,
      host: process.env.READER_HOST || '192.168.1.190',
      port: parseInt(process.env.READER_TCP_PORT, 10) || 4001,
      antennaMap,
    },
  ];
}

export function initRealAdapter(app, onTagBatch) {
  const readerConfigs = loadReaderConfigs();

  if (readerConfigs.length === 0) {
    console.warn(`${TAG} No reader configs found — set READER_* or RFID_READERS in .env`);
  }

  const connections = readerConfigs.map((cfg) => connectReader(cfg, onTagBatch));

  return {
    mode: 'real',
    implemented: true,
    readers: readerConfigs.map((c) => c.id),
    close: () => connections.forEach((c) => c.close()),
  };
}

function connectReader(cfg, onTagBatch) {
  const label = `${TAG}[${cfg.id}]`;
  const parser = createFrameParser();
  // One buffer per (gateId,direction) so two antennas firing at once (a
  // real in+out pass) never get merged into a single wrong-direction batch.
  const batches = new Map();

  let transport = null;
  let closedByUs = false;
  let reconnectTimer = null;

  function connect() {
    transport =
      cfg.transport === 'tcp'
        ? createTcpTransport({ host: cfg.host, port: cfg.port })
        : createSerialTransport({ path: cfg.path, baudRate: cfg.baudRate });

    transport.open((err) => {
      if (err) {
        console.error(`${label} failed to connect (${transport.describe()}): ${err.message}`);
        scheduleReconnect();
        return;
      }
      console.log(`${label} connected via ${transport.describe()}`);
      enableActiveMode();
    });

    transport.onData((chunk) => {
      let frames;
      try {
        frames = parser.push(chunk);
      } catch (err) {
        console.error(`${label} frame parse error: ${err.message}`);
        return;
      }
      for (const frame of frames) handleFrame(frame);
    });

    transport.onError((err) => console.error(`${label} transport error: ${err.message}`));

    transport.onClose(() => {
      if (!closedByUs) {
        console.warn(`${label} disconnected — retrying in 3s`);
        scheduleReconnect();
      }
    });
  }

  let inventoryTimer = null;
  let presenceCheckTimer = null;
  const PRESENCE_TIMEOUT_MS = parseInt(process.env.READER_PRESENCE_TIMEOUT_MS, 10) || 5000;
  const activeTags = new Map(); // Map<epc, { lastSeen: number, isPresent: boolean }>
  const INVENTORY_CMD = buildCommand(CID1.READ_UII, CID2.NONE, Buffer.alloc(0));

  function enableActiveMode() {
    const info = buildBaseParamsInfo({ workingMode: 0x01, readType: 0x02, readIntervalTicks: 0x0a, buzzer: 0x01 });
    const cmd = buildCommand(CID1.SET_BASE_PARAMS, CID2.SET, info);
    console.log(`${label} -> Set Base Parameters (Active mode + Net Output): ${cmd.toString('hex').toUpperCase()}`);
    transport.write(cmd, (err) => {
      if (err) console.error(`${label} failed to send Set Base Parameters: ${err.message}`);
    });

    if (inventoryTimer) clearInterval(inventoryTimer);
    inventoryTimer = setInterval(() => {
      transport.write(INVENTORY_CMD, () => {});
    }, 200);

    // Check for tags that went out of range every 1 second
    if (presenceCheckTimer) clearInterval(presenceCheckTimer);
    presenceCheckTimer = setInterval(() => {
      const now = Date.now();
      for (const [epc, state] of activeTags.entries()) {
        if (state.isPresent && now - state.lastSeen > PRESENCE_TIMEOUT_MS) {
          state.isPresent = false;
          console.log(`\n======================================================`);
          console.log(`${label} 📤 Tag LEFT antenna range: ${epc} -> ${cfg.gateId}:OUT`);
          console.log(`======================================================\n`);
          triggerMovement(cfg.gateId, 'OUT', [epc]);
        }
      }
    }, 1000);
  }

  function handleFrame(frame) {
    const tag = parseTagFrame(frame);
    if (!tag) return; // command ack / inventory-summary frame, not a tag read

    const now = Date.now();
    const epc = tag.epc;
    const existing = activeTags.get(epc);

    if (!existing || !existing.isPresent) {
      activeTags.set(epc, { lastSeen: now, isPresent: true });
      console.log(`\n======================================================`);
      console.log(`${label} 📥 Tag ENTERED antenna range: ${epc} (ANT=${tag.ant}, RSSI=0x${tag.rssi.toString(16)}) -> ${cfg.gateId}:IN`);
      console.log(`======================================================\n`);
      triggerMovement(cfg.gateId, 'IN', [epc]);
    } else {
      existing.lastSeen = now;
    }
  }

  async function triggerMovement(gateId, direction, epcs) {
    try {
      const result = await onTagBatch({
        gateId,
        direction,
        epcs,
        deviceId: cfg.id,
        timestamp: new Date().toISOString(),
      });
      console.log(`${label} batch processed (${direction}): ${result.matchedCount} matched, ${result.unknownCount} unknown`);
    } catch (err) {
      console.error(`${label} onTagBatch failed: ${err.message}`);
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 3000);
  }

  connect();

  return {
    close: () => {
      closedByUs = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (inventoryTimer) clearInterval(inventoryTimer);
      if (presenceCheckTimer) clearInterval(presenceCheckTimer);
      transport?.close();
    },
  };
}

/** Builds the 27-byte INFO payload for Set Base Parameters (spec 4.22). */
function buildBaseParamsInfo({ workingMode, readType, readIntervalTicks, buzzer }) {
  return Buffer.from([
    0x09, // OM output mode — 0x09 (0x01 Serial + 0x08 Network auto-output)
    workingMode, // WM: 0x01 = Active (auto-report, no polling needed)
    readType, // RT: 0x02 = EPC only
    readIntervalTicks, // RI: reading interval, x10ms
    0x00, // RD read delay (active mode only)
    0x02, 0x1e, 0x0a, 0x0f, // WG offset/interval/width/period — unused, no Wiegand output
    0x00, 0x01, // SI same-ID output interval (we dedupe/debounce in software anyway)
    buzzer, // BZ: 0x01 = buzzer on (matches the beep you already heard from the vendor app)
    0x00, 0x00, 0x00, 0x00, // AP access password
    0x00, // MB
    0x00, // SA
    0x00, // DL
    0x00, // CT
    0x00, // EL
    0x00, // KL
    0x00, 0x00, 0x00, 0x00, // KS
    0x00, // REV
  ]);
}