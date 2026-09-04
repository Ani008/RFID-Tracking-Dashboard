import File from '../models/File.js';
import UnknownTag from '../models/UnknownTag.js';

// GET /api/reports/court-room-files
// The "still missing" list — sorted oldest-arrival-first so the ones that
// have been sitting in the courtroom longest surface at the top.
export async function courtRoomFiles(req, res, next) {
  try {
    const files = await File.find({ currentLocation: 'COURT_ROOM', archived: { $ne: true } }).sort({
      lastMovementAt: 1,
    });
    res.json({ items: files, total: files.length });
  } catch (err) {
    next(err);
  }
}

// GET /api/reports/shelf-room-files
export async function shelfRoomFiles(req, res, next) {
  try {
    const files = await File.find({ currentLocation: 'SHELF_ROOM', archived: { $ne: true } }).sort({
      lastMovementAt: -1,
    });
    res.json({ items: files, total: files.length });
  } catch (err) {
    next(err);
  }
}

// GET /api/reports/unknown-tags
export async function unknownTags(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

    const [items, total] = await Promise.all([
      UnknownTag.find()
        .sort({ timestamp: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      UnknownTag.countDocuments(),
    ]);

    res.json({ items, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
}
