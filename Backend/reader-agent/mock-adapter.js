import express from 'express';

/**
 * Mock adapter used until real RFID hardware + vendor SDK are available.
 *
 * Exposes POST /api/simulate so both:
 *   - a CLI/curl call, and
 *   - the "Reader Simulator" admin page in the dashboard
 * can trigger a fake batch scan through the exact same path a real
 * reader would use (onTagBatch -> movement processing -> socket emit).
 *
 * Body shape:
 * {
 *   "gateId": "SHELF_ROOM_DOOR" | "COURT_ROOM_DOOR",
 *   "direction": "IN" | "OUT",
 *   "epcs": ["TAG1", "TAG2"],
 *   "deviceId": "mock-simulator"   // optional
 * }
 */
export function initMockAdapter(app, onTagBatch) {
  const router = express.Router();

  router.post('/simulate', async (req, res, next) => {
    try {
      const { gateId, direction, epcs, deviceId, timestamp } = req.body;

      if (!gateId || !direction || !Array.isArray(epcs) || epcs.length === 0) {
        return res.status(400).json({
          error: 'gateId, direction, and a non-empty epcs array are required',
        });
      }

      const result = await onTagBatch({
        gateId,
        direction,
        epcs,
        deviceId: deviceId || 'mock-simulator',
        timestamp: timestamp || new Date().toISOString(),
      });

      res.status(201).json({ source: 'mock-adapter', ...result });
    } catch (err) {
      next(err);
    }
  });

  app.use('/api', router);
  console.log('[mock-adapter] Simulator endpoint ready at POST /api/simulate');

  return { mode: 'mock' };
}
