/**
 * Hardware abstraction layer.
 *
 * Every adapter (mock or real) must call `onTagBatch(payload)` with:
 *   { gateId, direction, epcs: string[], deviceId, timestamp }
 *
 * This is the ONLY module that changes when real RFID hardware arrives.
 * The API, DB, and frontend never know whether a batch came from the
 * mock simulator or a physical reader.
 */
import { initMockAdapter } from "./mock-adapter.js";
import { initRealAdapter } from "./real-adapter.js";

/**
 * @param {import('express').Express} app
 * @param {(payload: object) => Promise<any>} onTagBatch - called with a raw batch;
 *   the caller (server.js) is responsible for feeding this into movementService.
 */
export function initReaderAgent(app, onTagBatch) {
  const mode = (process.env.READER_MODE || "mock").toLowerCase();

  if (mode === "real") {
    console.log("[reader-agent] Starting in REAL hardware mode (TCP/LAN or Serial)");
    return initRealAdapter(app, onTagBatch);
  }

  console.log("[reader-agent] Starting in MOCK simulator mode");
  return initMockAdapter(app, onTagBatch);
}

