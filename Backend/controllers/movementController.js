import { processMovementBatch, resolveLocation } from '../services/movementService.js';
import { emitMovement } from '../sockets/index.js';
import MovementLog from '../models/MovementLog.js';

const VALID_GATES = ['SHELF_ROOM_DOOR', 'COURT_ROOM_DOOR'];
const VALID_DIRECTIONS = ['IN', 'OUT'];

function validateBatch(body) {
  const { gateId, direction, epcs } = body;
  const errors = [];

  if (!gateId || !VALID_GATES.includes(gateId)) {
    errors.push(`gateId must be one of ${VALID_GATES.join(', ')}`);
  }
  if (!direction || !VALID_DIRECTIONS.includes(direction)) {
    errors.push(`direction must be one of ${VALID_DIRECTIONS.join(', ')}`);
  }
  if (!Array.isArray(epcs) || epcs.length === 0) {
    errors.push('epcs must be a non-empty array of strings');
  }
  if (gateId && direction && VALID_GATES.includes(gateId) && VALID_DIRECTIONS.includes(direction)) {
    if (!resolveLocation(gateId, direction)) {
      errors.push(`No location transition defined for gateId=${gateId} + direction=${direction}`);
    }
  }

  return errors;
}

/**
 * POST /api/movements
 * This is the single entry point both the mock adapter and (eventually)
 * the real adapter funnel into — see reader-agent/index.js.
 */
export async function ingestMovementBatch(req, res, next) {
  try {
    const errors = validateBatch(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    const result = await processMovementBatch(req.body);
    emitMovement(result);

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/movements
 * Paginated, filterable by gate/date range.
 * Query params: page, limit, gateId, from, to
 */
export async function listMovements(req, res, next) {
  try {
    const { gateId, from, to } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 25, 200);

    const filter = {};
    if (gateId) filter.gateId = gateId;
    if (from || to) {
      filter.timestamp = {};
      if (from) filter.timestamp.$gte = new Date(from);
      if (to) filter.timestamp.$lte = new Date(to);
    }

    const [items, total] = await Promise.all([
      MovementLog.find(filter)
        .sort({ timestamp: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      MovementLog.countDocuments(filter),
    ]);

    res.json({
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
}
