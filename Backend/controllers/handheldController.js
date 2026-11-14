import CauseListEntry from '../models/CauseListEntry.js';
import File from '../models/File.js';

// IST date helper: returns "YYYY-MM-DD" for today in Asia/Kolkata
function todayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * GET /api/handheld/causelist
 * Query params: date (default=today IST), q, caseType, court, limit (max 100)
 * Returns per item: causeListDate, courtNumber, serialNumber, caseNumber, cino,
 *                   caseType, rfidMapped, rfidTag, rackLocation, availability, fileId, _id
 */
export async function getHandheldCauseList(req, res, next) {
  try {
    const { date, q, caseType, court } = req.query;

    // Validate & sanitize
    if (date !== undefined && typeof date !== 'string') {
      return res.status(400).json({ error: 'date must be a string' });
    }
    if (q !== undefined && typeof q !== 'string') {
      return res.status(400).json({ error: 'q must be a string' });
    }
    if (caseType !== undefined && typeof caseType !== 'string') {
      return res.status(400).json({ error: 'caseType must be a string' });
    }
    if (court !== undefined && typeof court !== 'string') {
      return res.status(400).json({ error: 'court must be a string' });
    }

    const targetDate = date ? String(date).trim() : todayIST();
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 100;

    const filter = { causeListDate: targetDate };

    if (court) {
      filter.courtNumber = String(court).trim();
    }

    if (caseType && caseType !== 'ALL') {
      filter.caseType = String(caseType).trim().toUpperCase();
    }

    if (q) {
      const trimmedQ = String(q).trim().slice(0, 50);
      if (trimmedQ.length > 0) {
        const re = new RegExp(escapeRegex(trimmedQ), 'i');
        filter.$or = [{ caseNumber: re }, { cino: re }];
      }
    }

    const entries = await CauseListEntry.find(filter)
      .populate('file', 'fileId fileName rfidTag currentLocation rackLocation caseStatus')
      .sort({ courtNumber: 1, serialNumber: 1 })
      .limit(limit)
      .lean();

    // Compute availability per entry
    const items = entries.map((e) => {
      const file = e.file;
      let availability;

      if (!file) {
        availability = 'NO_FILE';
      } else if (!file.rfidTag || !file.rfidTag.trim()) {
        availability = 'NO_RFID';
      } else if (!file.rackLocation || !file.rackLocation.rack) {
        availability = 'NO_RACK';
      } else {
        availability = 'LOCATED';
      }

      return {
        _id: e._id,
        causeListDate: e.causeListDate,
        courtNumber: e.courtNumber,
        serialNumber: e.serialNumber,
        caseNumber: e.caseNumber || null,
        cino: e.cino || null,
        caseType: e.caseType || null,
        rfidMapped: Boolean(file?.rfidTag?.trim()),
        rfidTag: file?.rfidTag || null,
        rackLocation: file?.rackLocation || null,
        availability,
        fileId: file?._id || null,
        currentLocation: file?.currentLocation || null,
      };
    });

    res.json({
      date: targetDate,
      total: items.length,
      limit,
      items,
    });
  } catch (err) {
    next(err);
  }
}

