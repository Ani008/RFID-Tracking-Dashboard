import 'dotenv/config';
import { createTcpTransport } from '../reader-agent/transport.js';
import { createFrameParser, parseTagFrame, buildCommand, CID1, CID2 } from '../reader-agent/protocol.js';

const host = process.env.READER_HOST || '192.168.2.116';
const port = parseInt(process.env.READER_TCP_PORT, 10) || 49152;

console.log(`[lan-test] Connecting to CR15 LAN reader at ${host}:${port}...`);

const transport = createTcpTransport({ host, port, connectTimeoutMs: 5000 });
const parser = createFrameParser();
let pollTimer = null;

// Command to read/inventory tags: CID1=0x20, CID2=0x00, len=0 -> 7C FF FF 20 00 00 E1
const INVENTORY_CMD = buildCommand(CID1.READ_UII, CID2.NONE, Buffer.alloc(0));

transport.open((err) => {
  if (err) {
    console.error(`[lan-test] ❌ Connection failed: ${err.message}`);
    process.exit(1);
  }

  console.log(`[lan-test] ✅ Connected successfully to ${host}:${port}!`);
  
  // Set Base Parameters with Output Mode = 0x09 (Network + Serial enabled)
  // Matching the exact parameters from the vendor demo app
  const info = Buffer.from([
    0x09, // OM: 0x09 = Network + RS232 output
    0x01, // WM: 0x01 = Active mode
    0x02, // RT: 0x02 = EPC only
    0x0A, // RI: 100ms
    0x01, // RD: 1
    0x0B, 0x1E, 0x0A, 0x0F, // WG settings
    0x00, 0x01, // Same ID interval
    0x01, // BZ: Buzzer ON
    0x00, 0x00, 0x00, 0x02, // Access password
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00
  ]);
  const cmd = buildCommand(CID1.SET_BASE_PARAMS, CID2.SET, info);
  console.log(`[lan-test] -> Sent Setup Command (Network Auto-Send & Buzzer ON): ${cmd.toString('hex').toUpperCase()}`);
  transport.write(cmd, (err) => {
    if (err) console.error(`[lan-test] Setup write error:`, err);
  });

  // Also start an inventory poll loop (every 200ms) to ensure continuous scanning
  pollTimer = setInterval(() => {
    transport.write(INVENTORY_CMD, () => {});
  }, 200);

  console.log(`[lan-test] 📡 Continuous scanning active! Please hold / wave your RFID tag in front of the CR15 antenna now.`);
});

transport.onData((chunk) => {
  const hex = chunk.toString('hex').toUpperCase();
  
  // Ignore empty summary / no-tag response (CC FF FF 20 02 00 DF or CC FF FF 20 00 00 E1 or CC FF FF 81 00 00 B5) to keep terminal clean
  if (hex === 'CCFFFF200200DF' || hex === 'CCFFFF810000B5' || hex === 'CCFFFF200000E1') {
    return;
  }

  const frames = parser.push(chunk);
  for (const frame of frames) {
    const tag = parseTagFrame(frame);
    if (tag) {
      console.log(`\n======================================================`);
      console.log(`🎯 TAG DETECTED!`);
      console.log(`   EPC Code : ${tag.epc}`);
      console.log(`   Antenna  : ${tag.ant}`);
      console.log(`   Signal   : ${tag.rssi}`);
      console.log(`======================================================\n`);
    } else {
      console.log(`[lan-test] Incoming data: ${chunk.toString('hex').toUpperCase()}`);
    }
  }
});

transport.onError((err) => {
  console.error(`[lan-test] Socket error: ${err.message}`);
});

transport.onClose(() => {
  if (pollTimer) clearInterval(pollTimer);
  console.log(`[lan-test] Connection closed.`);
});
