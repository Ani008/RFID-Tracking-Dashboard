import CauseListEntry from '../models/CauseListEntry.js';
import SyncRun from '../models/SyncRun.js';
import { runSync, rematchEntries, retryFailedRows } from '../services/causelist/syncService.js';
import { ManualUploadAdapter } from '../services/causelist/adapters/manualUploadAdapter.js';
import { HttpAdapter } from '../services/causelist/adapters/httpAdapter.js';

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// POST /api/causelist/sync (Admin only)
export async function triggerSync(req, res, next) {
  try {
    const userId = req.user?._id;
    const username = req.user?.username || 'admin';
    let adapter;
    let date = req.body?.date ? String(req.body.date).trim() : '';

    if (req.file) {
      // Upload-based sync
      adapter = new ManualUploadAdapter(req.file.buffer, req.file.originalname);
    } else {
      // HTTP / Stub adapter
      if (!date) {
        return res.status(400).json({ error: 'date (YYYY-MM-DD) or an uploaded file is required' });
      }
      adapter = new HttpAdapter();
    }

    const syncRun = await runSync({
      date,
      adapter,
      userId,
      username,
      trigger: 'MANUAL',
    });

    res.status(201).json(syncRun);
  } catch (err) {
    if (err.message.includes('already in progress')) {
      return res.status(409).json({ error: err.message });
    }
    next(err);
  }
}

// POST /api/causelist/sync/:runId/retry (Admin only)
export async function retrySyncRun(req, res, next) {
  try {
    const { runId } = req.params;
    const result = await retryFailedRows({
      runId,
      userId: req.user?._id,
      username: req.user?.username || 'admin',
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// POST /api/causelist/rematch (Admin only)
export async function triggerRematch(req, res, next) {
  try {
    const date = req.body?.date ? String(req.body.date).trim() : undefined;
    const result = await rematchEntries({
      date,
      userId: req.user?._id,
      username: req.user?.username || 'admin',
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/causelist/sync-runs (Admin & staff)
export async function listSyncRuns(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

    const [runs, total] = await Promise.all([
      SyncRun.find({}, { failures: 0 })
        .sort({ startedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      SyncRun.countDocuments({}),
    ]);

    res.json({
      items: runs,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/causelist/sync-runs/:id (Admin & staff)
export async function getSyncRun(req, res, next) {
  try {
    const run = await SyncRun.findById(req.params.id);
    if (!run) return res.status(404).json({ error: `SyncRun "${req.params.id}" not found` });
    res.json(run);
  } catch (err) {
    next(err);
  }
}

// GET /api/causelist?date=&court=&caseType=&status=&mapped=&match=&q=&page=&limit=
export async function listCauseListEntries(req, res, next) {
  try {
    const { date, court, caseType, status, mapped, match, q } = req.query;
    const filter = {};
    const andConditions = [];

    if (date) {
      if (typeof date !== 'string') return res.status(400).json({ error: 'date must be a string' });
      andConditions.push({ causeListDate: date.trim() });
    }
    if (court) {
      if (typeof court !== 'string') return res.status(400).json({ error: 'court must be a string' });
      andConditions.push({ courtNumber: court.trim() });
    }
    if (caseType && caseType !== 'ALL') {
      if (typeof caseType !== 'string') return res.status(400).json({ error: 'caseType must be a string' });
      andConditions.push({ caseType: caseType.trim().toUpperCase() });
    }
    if (status && status !== 'ALL') {
      if (typeof status !== 'string') return res.status(400).json({ error: 'status must be a string' });
      const s = status.trim().toUpperCase();
      if (!['PENDING', 'DISPOSED'].includes(s)) {
        return res.status(400).json({ error: 'status must be ALL, PENDING, or DISPOSED' });
      }
      andConditions.push({ caseStatus: s });
    }
    if (match && match !== 'ALL') {
      if (typeof match !== 'string') return res.status(400).json({ error: 'match must be a string' });
      const m = match.trim().toUpperCase();
      if (!['MATCHED', 'UNMATCHED', 'AMBIGUOUS'].includes(m)) {
        return res.status(400).json({ error: 'match must be MATCHED, UNMATCHED, or AMBIGUOUS' });
      }
      andConditions.push({ matchStatus: m });
    }
    if (q) {
      if (typeof q !== 'string') return res.status(400).json({ error: 'q must be a string' });
      const trimmedQ = q.trim().slice(0, 50);
      if (trimmedQ.length > 0) {
        const re = new RegExp(escapeRegex(trimmedQ), 'i');
        andConditions.push({
          $or: [{ caseNumber: re }, { cino: re }, { bench: re }],
        });
      }
    }

    if (andConditions.length > 0) {
      filter.$and = andConditions;
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);

    let query = CauseListEntry.find(filter)
      .populate('file', 'fileId fileName caseId rfidTag currentLocation rackLocation caseStatus')
      .sort({ courtNumber: 1, serialNumber: 1 });

    const [entries, total] = await Promise.all([
      query.skip((page - 1) * limit).limit(limit),
      CauseListEntry.countDocuments(filter),
    ]);

    // Client-side/joined filter on mapped if requested
    let items = entries;
    if (mapped !== undefined && mapped !== '') {
      const isMapped = String(mapped).toLowerCase() === 'true';
      items = items.filter((e) => {
        const hasTag = Boolean(e.file?.rfidTag && e.file?.rfidTag.trim().length > 0);
        return isMapped ? hasTag : !hasTag;
      });
    }

    res.json({
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/causelist/unmatched?date=&page=&limit=
export async function listUnmatchedEntries(req, res, next) {
  try {
    const { date } = req.query;
    const filter = {
      matchStatus: { $in: ['UNMATCHED', 'AMBIGUOUS'] },
    };
    if (date) filter.causeListDate = String(date).trim();

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);

    const [items, total] = await Promise.all([
      CauseListEntry.find(filter)
        .sort({ causeListDate: -1, courtNumber: 1, serialNumber: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      CauseListEntry.countDocuments(filter),
    ]);

    res.json({
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/causelist/history/:cino
export async function getCaseHistory(req, res, next) {
  try {
    const rawCino = String(req.params.cino || '').trim().toUpperCase();
    if (!rawCino) return res.status(400).json({ error: 'CINO is required' });

    const entries = await CauseListEntry.find({ cino: rawCino })
      .populate('file', 'fileId fileName currentLocation rfidTag rackLocation')
      .sort({ causeListDate: -1, courtNumber: 1 });

    res.json({
      cino: rawCino,
      totalAppearances: entries.length,
      history: entries,
    });
  } catch (err) {
    next(err);
  }
}

