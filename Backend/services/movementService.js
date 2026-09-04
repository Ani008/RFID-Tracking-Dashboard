import File from '../models/File.js';
import MovementLog from '../models/MovementLog.js';
import UnknownTag from '../models/UnknownTag.js';

/**
 * Maps (gateId, direction) -> resulting File.currentLocation
 */
const LOCATION_TRANSITIONS = {
  'SHELF_ROOM_DOOR:OUT': 'IN_TRANSIT',
  'SHELF_ROOM_DOOR:IN': 'SHELF_ROOM',
  'COURT_ROOM_DOOR:IN': 'COURT_ROOM',
  'COURT_ROOM_DOOR:OUT': 'IN_TRANSIT',
};

function resolveLocation(gateId, direction) {
  return LOCATION_TRANSITIONS[`${gateId}:${direction}`] ?? null;
}

/**
 * Processes a batch scan event.
 * Never throws on a per-tag problem — bad tags are isolated into the
 * `unknown` bucket so one bad EPC never fails the whole batch.
 *
 * @param {Object} batch
 * @param {string} batch.gateId
 * @param {string} batch.direction
 * @param {string[]} batch.epcs
 * @param {string} [batch.deviceId]
 * @param {string|Date} [batch.timestamp]
 * @param {string} [batch.batchId]
 * @returns {Promise<{batchId, matched: Array, unknown: Array, gateId, direction, timestamp}>}
 */
export async function processMovementBatch(batch) {
  const { gateId, direction, epcs, deviceId } = batch;
  const timestamp = batch.timestamp ? new Date(batch.timestamp) : new Date();
  const batchId = batch.batchId || `${gateId}-${Date.now()}`;

  const resultingLocation = resolveLocation(gateId, direction);
  if (!resultingLocation) {
    // Should be caught by validation before this is called, but guard anyway.
    throw new Error(`No transition defined for gateId=${gateId} direction=${direction}`);
  }

  const matched = [];
  const unknown = [];

  // De-dupe EPCs within a single batch, preserving order.
  const uniqueEpcs = [...new Set(epcs)];

  for (const rfidTag of uniqueEpcs) {
    try {
      const file = await File.findOne({ rfidTag });

      if (!file) {
        await UnknownTag.create({
          rfidTag,
          gateId,
          direction,
          timestamp,
          deviceId,
          batchId,
        });
        unknown.push({ rfidTag });
        continue;
      }

      file.currentLocation = resultingLocation;
      file.lastMovementAt = timestamp;
      await file.save();

      await MovementLog.create({
        rfidTag,
        fileId: file.fileId,
        gateId,
        direction,
        timestamp,
        deviceId,
        batchId,
        resultingLocation,
      });

      matched.push({
        rfidTag,
        fileId: file.fileId,
        fileName: file.fileName,
        newLocation: resultingLocation,
      });
    } catch (err) {
      // Isolate the failure to this tag only; keep processing the rest of the batch.
      unknown.push({ rfidTag, error: err.message });
    }
  }

  return {
    batchId,
    gateId,
    direction,
    timestamp,
    matchedCount: matched.length,
    unknownCount: unknown.length,
    matched,
    unknown,
  };
}

export { resolveLocation, LOCATION_TRANSITIONS };
