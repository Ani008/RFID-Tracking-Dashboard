import Gate from '../models/Gate.js';

const VALID_GATE_IDS = ['SHELF_ROOM_DOOR', 'COURT_ROOM_DOOR'];

// GET /api/gates
export async function listGates(req, res, next) {
  try {
    const gates = await Gate.find().sort({ gateId: 1 });
    res.json({ items: gates, total: gates.length });
  } catch (err) {
    next(err);
  }
}

// POST /api/gates
export async function createGate(req, res, next) {
  try {
    const { gateId, label, location } = req.body;
    const errors = [];

    if (!gateId || !VALID_GATE_IDS.includes(gateId)) {
      errors.push(`gateId must be one of ${VALID_GATE_IDS.join(', ')}`);
    }
    if (!label || typeof label !== 'string' || !label.trim()) {
      errors.push('label is required');
    }
    if (errors.length > 0) return res.status(400).json({ errors });

    const existing = await Gate.findOne({ gateId });
    if (existing) return res.status(409).json({ error: `Gate "${gateId}" already exists` });

    const gate = await Gate.create({ gateId, label, location });
    res.status(201).json(gate);
  } catch (err) {
    next(err);
  }
}
