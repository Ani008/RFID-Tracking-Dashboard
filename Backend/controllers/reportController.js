import File from '../models/File.js';
import MovementLog from '../models/MovementLog.js';
import UnknownTag from '../models/UnknownTag.js';
import AuditLog from '../models/AuditLog.js';

const DEFAULT_TIME_ZONE = 'Asia/Kolkata';
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDateRange(from, to) {
  const filter = {};
  if (from || to) {
    filter.timestamp = {};
    if (from) {
      const fromDate = new Date(from);
      if (isNaN(fromDate.getTime())) throw new Error('Invalid "from" date format');
      filter.timestamp.$gte = fromDate;
    }
    if (to) {
      const toDate = new Date(to);
      if (isNaN(toDate.getTime())) throw new Error('Invalid "to" date format');
      filter.timestamp.$lte = toDate;
    }
    if (from && to && new Date(from) > new Date(to)) {
      throw new Error('"from" date cannot be after "to" date');
    }
  }
  return filter;
}

/**
 * Escapes CSV field values and neutralizes CSV formula injection (DDE attacks).
 * If a field starts with '=', '+', '-', '@', tab, or return, it is prepended with a single quote.
 */
function escapeCsvField(val) {
  if (val === null || val === undefined) return '""';
  let str = String(val);

  // Neutralize CSV Formula Injection
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  str = str.replace(/"/g, '""');
  return `"${str}"`;
}

function toCsvString(headers, rows) {
  const headerLine = headers.map(escapeCsvField).join(',');
  const rowLines = rows.map((row) => row.map(escapeCsvField).join(','));
  return [headerLine, ...rowLines].join('\r\n');
}

// ---------------------------------------------------------------------------
// Daily tagging report helpers
// ---------------------------------------------------------------------------

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function resolveTimeZone(tz) {
  const candidate = String(tz || DEFAULT_TIME_ZONE);
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: candidate });
    return candidate;
  } catch {
    throw httpError(400, `Invalid time zone "${candidate}"`);
  }
}

// Returns the calendar day (YYYY-MM-DD) of `date` as seen in the given time zone.
function dayStringInTz(date, tz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// Pure calendar arithmetic on a YYYY-MM-DD string (no time zone involved).
function addDays(dayStr, delta) {
  const d = new Date(`${dayStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * Counts how many distinct files were tagged (RFID tag paired / re-assigned)
 * on each calendar day. Every tagging action is already stamped in the audit
 * log (TAG_REASSIGN from the Edit File screen, FILE_CREATE with a tag from
 * Register File), so this also covers all tagging done before this report
 * existed.
 *
 * `fromDay` / `toDay` are optional YYYY-MM-DD strings, inclusive, interpreted
 * in time zone `tz`.
 */
async function aggregateDailyTagging({ tz, fromDay, toDay }) {
  const match = {
    $or: [
      { action: 'TAG_REASSIGN' },
      { action: 'FILE_CREATE', 'after.rfidTag': { $exists: true, $nin: [null, ''] } },
    ],
  };

  // Coarse timestamp pre-filter so the timestamp index can be used. Padded by a
  // day on each side because the real day boundary depends on the time zone;
  // the exact filtering is done on the per-day string below.
  if (fromDay || toDay) {
    match.timestamp = {};
    if (fromDay) match.timestamp.$gte = new Date(new Date(`${fromDay}T00:00:00.000Z`).getTime() - MS_PER_DAY);
    if (toDay) match.timestamp.$lte = new Date(new Date(`${toDay}T00:00:00.000Z`).getTime() + 2 * MS_PER_DAY);
  }

  const dayRange = {};
  if (fromDay) dayRange.$gte = fromDay;
  if (toDay) dayRange.$lte = toDay;

  const pipeline = [
    { $match: match },
    {
      $addFields: {
        day: { $dateToString: { date: '$timestamp', format: '%Y-%m-%d', timezone: tz } },
        // 1 = file had no tag before (first-time tagging), 0 = tag was replaced
        isFirst: {
          $cond: [
            {
              $or: [
                { $eq: ['$action', 'FILE_CREATE'] },
                { $eq: [{ $ifNull: ['$before.rfidTag', ''] }, ''] },
              ],
            },
            1,
            0,
          ],
        },
      },
    },
    ...(Object.keys(dayRange).length ? [{ $match: { day: dayRange } }] : []),
    { $sort: { timestamp: 1 } },
    // One row per (day, file) so a file edited twice in a day counts once
    {
      $group: {
        _id: { day: '$day', fileId: '$targetId' },
        isFirst: { $max: '$isFirst' },
        user: { $last: '$username' },
      },
    },
    {
      $group: {
        _id: '$_id.day',
        filesTagged: { $sum: 1 },
        firstTime: { $sum: '$isFirst' },
        users: { $push: '$user' },
      },
    },
    { $sort: { _id: -1 } },
  ];

  const rows = await AuditLog.aggregate(pipeline).allowDiskUse(true);

  return rows.map((r) => {
    const perUser = {};
    for (const u of r.users) perUser[u || 'unknown'] = (perUser[u || 'unknown'] || 0) + 1;
    return {
      date: r._id,
      filesTagged: r.filesTagged,
      firstTime: r.firstTime,
      reassigned: r.filesTagged - r.firstTime,
      byUser: Object.entries(perUser)
        .map(([username, count]) => ({ username, count }))
        .sort((a, b) => b.count - a.count || a.username.localeCompare(b.username)),
    };
  });
}

async function buildDailyTaggingReport({ from, to, tz }) {
  const timeZone = resolveTimeZone(tz);

  if (from && !DAY_RE.test(from)) throw httpError(400, '"from" must be in YYYY-MM-DD format');
  if (to && !DAY_RE.test(to)) throw httpError(400, '"to" must be in YYYY-MM-DD format');
  if (from && to && from > to) throw httpError(400, '"from" date cannot be after "to" date');

  const todayStr = dayStringInTz(new Date(), timeZone);
  const yesterdayStr = addDays(todayStr, -1);

  // Today / yesterday cards ignore the date filter, so they get their own query.
  const [items, recent] = await Promise.all([
    aggregateDailyTagging({ tz: timeZone, fromDay: from, toDay: to }),
    aggregateDailyTagging({ tz: timeZone, fromDay: yesterdayStr, toDay: todayStr }),
  ]);

  const countFor = (day) => recent.find((r) => r.date === day)?.filesTagged || 0;
  const totalTagged = items.reduce((sum, r) => sum + r.filesTagged, 0);
  const peak = items.reduce((best, r) => (!best || r.filesTagged > best.filesTagged ? r : best), null);

  return {
    report: 'daily-tagging',
    timeZone,
    items,
    totalDays: items.length,
    totalTagged,
    averagePerDay: items.length ? Math.round((totalTagged / items.length) * 10) / 10 : 0,
    peakDay: peak ? { date: peak.date, filesTagged: peak.filesTagged } : null,
    today: { date: todayStr, filesTagged: countFor(todayStr) },
    yesterday: { date: yesterdayStr, filesTagged: countFor(yesterdayStr) },
  };
}

// GET /api/reports/daily-tagging?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=Asia/Kolkata
export async function dailyTagging(req, res, next) {
  try {
    const { from, to, tz } = req.query;
    const report = await buildDailyTaggingReport({ from, to, tz });
    res.json(report);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

// GET /api/reports/court-room-files?from=&to=&thresholdHours=
export async function courtRoomFiles(req, res, next) {
  try {
    const { from, to, thresholdHours = 4 } = req.query;
    const thresholdNum = parseFloat(thresholdHours) || 4;

    const filter = { currentLocation: 'COURT_ROOM', archived: { $ne: true } };

    if (from || to) {
      filter.lastMovementAt = {};
      if (from) {
        const fromDate = new Date(from);
        if (isNaN(fromDate.getTime())) return res.status(400).json({ error: 'Invalid "from" date' });
        filter.lastMovementAt.$gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        if (isNaN(toDate.getTime())) return res.status(400).json({ error: 'Invalid "to" date' });
        filter.lastMovementAt.$lte = toDate;
      }
      if (from && to && new Date(from) > new Date(to)) {
        return res.status(400).json({ error: '"from" date cannot be after "to" date' });
      }
    }

    const files = await File.find(filter).sort({ lastMovementAt: 1 });
    const now = Date.now();

    const items = files.map((file) => {
      const arrival = file.lastMovementAt ? new Date(file.lastMovementAt).getTime() : now;
      const dwellMinutes = Math.max(0, Math.floor((now - arrival) / (1000 * 60)));
      const dwellHours = Number((dwellMinutes / 60).toFixed(1));
      const overstay = dwellHours >= thresholdNum;

      return {
        ...file.toObject(),
        dwellMinutes,
        dwellHours,
        overstay,
      };
    });

    const overstayCount = items.filter((f) => f.overstay).length;

    res.json({
      items,
      total: items.length,
      overstayCount,
      thresholdHours: thresholdNum,
    });
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

// GET /api/reports/movements?from=&to=&gateId=&direction=&page=&limit=
export async function movementReport(req, res, next) {
  try {
    const { from, to, gateId, direction, search } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

    let dateFilter;
    try {
      dateFilter = parseDateRange(from, to);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const filter = { ...dateFilter };
    if (gateId) filter.gateId = gateId;
    if (direction) filter.direction = direction;

    if (search) {
      const re = new RegExp(search, 'i');
      filter.$or = [{ fileId: re }, { rfidTag: re }, { batchId: re }];
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

// GET /api/reports/unknown-tags?from=&to=&page=&limit=
export async function unknownTags(req, res, next) {
  try {
    const { from, to, gateId } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

    let dateFilter;
    try {
      dateFilter = parseDateRange(from, to);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const filter = { ...dateFilter };
    if (gateId) filter.gateId = gateId;

    const [items, total] = await Promise.all([
      UnknownTag.find(filter)
        .sort({ timestamp: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      UnknownTag.countDocuments(filter),
    ]);

    res.json({ items, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
}

// GET /api/reports/case/:caseId
export async function caseSummary(req, res, next) {
  try {
    const { caseId } = req.params;
    if (!caseId) return res.status(400).json({ error: 'caseId is required' });

    const files = await File.find({ caseId: caseId.trim() }).sort({ fileId: 1 });
    if (files.length === 0) {
      return res.status(404).json({ error: `No files found for caseId "${caseId}"` });
    }

    const fileIds = files.map((f) => f.fileId);
    const recentMovements = await MovementLog.find({ fileId: { $in: fileIds } })
      .sort({ timestamp: -1 })
      .limit(30);

    const locationSummary = files.reduce((acc, f) => {
      acc[f.currentLocation] = (acc[f.currentLocation] || 0) + 1;
      return acc;
    }, {});

    res.json({
      caseId,
      caseName: files[0]?.caseName || '',
      totalFiles: files.length,
      locationSummary,
      files,
      recentMovements,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/reports/:type/export
export async function exportReportCsv(req, res, next) {
  try {
    const { type } = req.params;
    const { from, to, gateId, direction, caseId, thresholdHours = 4 } = req.query;

    let csvContent = '';
    const dateStr = new Date().toISOString().slice(0, 10);
    let fileName = `report_${type}_${dateStr}.csv`;

    if (type === 'court-room-files') {
      const filter = { currentLocation: 'COURT_ROOM', archived: { $ne: true } };
      if (from || to) {
        filter.lastMovementAt = {};
        if (from) filter.lastMovementAt.$gte = new Date(from);
        if (to) filter.lastMovementAt.$lte = new Date(to);
      }
      const files = await File.find(filter).sort({ lastMovementAt: 1 }).limit(5000);
      const now = Date.now();
      const thresholdNum = parseFloat(thresholdHours) || 4;

      const headers = ['File ID', 'File Name', 'Case ID', 'Case Name', 'RFID Tag', 'Last Movement At', 'Dwell Time (Hours)', 'Overstay Alert'];
      const rows = files.map((f) => {
        const arrival = f.lastMovementAt ? new Date(f.lastMovementAt).getTime() : now;
        const dwellHours = Number((Math.max(0, now - arrival) / (1000 * 60 * 60)).toFixed(1));
        const overstay = dwellHours >= thresholdNum ? 'YES (OVERSTAY)' : 'NO';
        return [
          f.fileId,
          f.fileName,
          f.caseId,
          f.caseName,
          f.rfidTag,
          f.lastMovementAt ? new Date(f.lastMovementAt).toISOString() : '',
          dwellHours,
          overstay,
        ];
      });
      csvContent = toCsvString(headers, rows);
      fileName = `courtroom_dwell_report_${dateStr}.csv`;
    } else if (type === 'movements') {
      const filter = {};
      if (from || to) {
        filter.timestamp = {};
        if (from) filter.timestamp.$gte = new Date(from);
        if (to) filter.timestamp.$lte = new Date(to);
      }
      if (gateId) filter.gateId = gateId;
      if (direction) filter.direction = direction;

      const movements = await MovementLog.find(filter).sort({ timestamp: -1 }).limit(5000);
      const headers = ['Timestamp', 'File ID', 'RFID Tag', 'Gate', 'Direction', 'Resulting Location', 'Device ID', 'Batch ID'];
      const rows = movements.map((m) => [
        new Date(m.timestamp).toISOString(),
        m.fileId,
        m.rfidTag,
        m.gateId,
        m.direction,
        m.resultingLocation || '',
        m.deviceId || '',
        m.batchId || '',
      ]);
      csvContent = toCsvString(headers, rows);
      fileName = `movement_history_report_${dateStr}.csv`;
    } else if (type === 'unknown-tags') {
      const filter = {};
      if (from || to) {
        filter.timestamp = {};
        if (from) filter.timestamp.$gte = new Date(from);
        if (to) filter.timestamp.$lte = new Date(to);
      }
      if (gateId) filter.gateId = gateId;

      const unknown = await UnknownTag.find(filter).sort({ timestamp: -1 }).limit(5000);
      const headers = ['Timestamp', 'Unregistered RFID Tag', 'Gate ID', 'Direction', 'Device ID', 'Batch ID'];
      const rows = unknown.map((u) => [
        new Date(u.timestamp).toISOString(),
        u.rfidTag,
        u.gateId,
        u.direction,
        u.deviceId || '',
        u.batchId || '',
      ]);
      csvContent = toCsvString(headers, rows);
      fileName = `unknown_tags_report_${dateStr}.csv`;
    } else if (type === 'case-summary' && caseId) {
      const files = await File.find({ caseId: caseId.trim() }).sort({ fileId: 1 }).limit(5000);
      const headers = ['File ID', 'File Name', 'Case ID', 'Case Name', 'Current Location', 'RFID Tag', 'Last Movement At', 'Created At'];
      const rows = files.map((f) => [
        f.fileId,
        f.fileName,
        f.caseId,
        f.caseName,
        f.currentLocation,
        f.rfidTag,
        f.lastMovementAt ? new Date(f.lastMovementAt).toISOString() : '',
        f.createdAt ? new Date(f.createdAt).toISOString() : '',
      ]);
      csvContent = toCsvString(headers, rows);
      fileName = `case_${caseId}_summary_${dateStr}.csv`;
    } else if (type === 'daily-report') {
      let report;
      try {
        report = await buildDailyTaggingReport({ from, to, tz: req.query.tz });
      } catch (err) {
        if (err.status) return res.status(err.status).json({ error: err.message });
        throw err;
      }
      const headers = ['Date', 'Files Tagged', 'First-time Tags', 'Re-assigned Tags', 'Tagged By'];
      const rows = report.items.map((r) => [
        r.date,
        r.filesTagged,
        r.firstTime,
        r.reassigned,
        r.byUser.map((u) => `${u.username} (${u.count})`).join('; '),
      ]);
      csvContent = toCsvString(headers, rows);
      fileName = `daily_tagging_report_${dateStr}.csv`;
    } else {
      return res.status(400).json({ error: `Unknown report type "${type}"` });
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.status(200).send(csvContent);
  } catch (err) {
    next(err);
  }
}