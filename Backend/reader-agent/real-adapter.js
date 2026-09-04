/**
 * STUB — implement once physical readers + vendor SDK are available.
 *
 * This adapter must ultimately call `onTagBatch({ gateId, direction, epcs,
 * deviceId, timestamp })` with the exact same shape the mock adapter uses,
 * so movementService and everything downstream (API, DB, sockets, frontend)
 * needs zero changes when this goes live.
 *
 * Typical implementation steps (vendor SDK dependent):
 *   1. TODO: Import vendor SDK / driver for the physical RFID reader(s).
 *   2. TODO: Open a connection/session to each reader (by IP, serial port, etc).
 *      Likely need one connection per physical gate (SHELF_ROOM_DOOR, COURT_ROOM_DOOR),
 *      or one multiplexed connection if using a reader controller.
 *   3. TODO: Subscribe to the reader's "tag read" / "inventory" event stream.
 *   4. TODO: Buffer/debounce raw tag reads into a "batch" — readers typically
 *      fire many events per second per tag while it's in range, so you'll need
 *      a short time window (e.g. 1-2s) to group reads into a single batch
 *      per doorway pass, and de-dupe EPCs within that window.
 *   5. TODO: Determine `direction` (IN vs OUT). Depending on hardware this
 *      might come from:
 *        - two antennas per doorway (entry/exit) and read order, or
 *        - a paired IR/beam sensor, or
 *        - vendor-specific "zone" transition events.
 *   6. TODO: Map the physical reader/antenna id to our `gateId` enum
 *      ('SHELF_ROOM_DOOR' | 'COURT_ROOM_DOOR') via a config lookup table.
 *   7. Call onTagBatch({ gateId, direction, epcs, deviceId, timestamp }).
 *   8. TODO: Handle reconnects / reader offline alerts (out of scope for MVP).
 */
export function initRealAdapter(app, onTagBatch) {
  console.warn(
    '[real-adapter] READER_MODE=real but no hardware integration is implemented yet. ' +
      'This is a stub — see comments in real-adapter.js for what needs to be built.'
  );

  // Example of what a debounce/dedupe buffer might look like once wired up:
  //
  // const buffer = new Map(); // gateId -> { epcs: Set, timer }
  // function onRawTagRead({ gateId, epc, direction, deviceId }) {
  //   if (!buffer.has(gateId)) buffer.set(gateId, { epcs: new Set(), direction, deviceId, timer: null });
  //   const entry = buffer.get(gateId);
  //   entry.epcs.add(epc);
  //   clearTimeout(entry.timer);
  //   entry.timer = setTimeout(() => {
  //     onTagBatch({
  //       gateId,
  //       direction: entry.direction,
  //       epcs: [...entry.epcs],
  //       deviceId: entry.deviceId,
  //       timestamp: new Date().toISOString(),
  //     });
  //     buffer.delete(gateId);
  //   }, 1500);
  // }

  return { mode: 'real', implemented: false };
}
