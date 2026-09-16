import * as XLSX from 'xlsx';
import File from '../models/File.js';
import MovementLog from '../models/MovementLog.js';
import AuditLog from '../models/AuditLog.js';
import { normalizeRfidTag } from '../utils/rfidHelper.js';

const VALID_LOCATIONS = ['SHELF_ROOM', 'COURT_ROOM', 'IN_TRANSIT'];

function validateFilePayload(body, { partial = false } = {}) {
  const errors = [];
  const required = ['fileId', 'fileName', 'caseId'];

  if (!partial) {
    for (const field of required) {
      if (!body[field] || typeof body[field] !== 'string' || !body[field].trim()) {
        errors.push(`${field} is required`);
      }
    }
  } else {
    for (const field of required) {
      if (field in body && (!body[field] || typeof body[field] !== 'string' || !body[field].trim())) {
        errors.push(`${field} cannot be empty`);
      }
    }
  }

  return errors;
}

// GET /api/files?location=&caseId=&search=&page=&limit=
// Pagination is opt-in: pass `page` to get a paginated response. Callers that
// don't pass `page` (e.g. Dashboard, which needs every file for its counts)
// keep getting the full matching set, unchanged.
export async function listFiles(req, res, next) {
  try {
    const { location, caseId, search } = req.query;
    const filter = { archived: { $ne: true } };

    if (location) {
      if (!VALID_LOCATIONS.includes(location)) {
        return res.status(400).json({ error: `location must be one of ${VALID_LOCATIONS.join(', ')}` });
      }
      filter.currentLocation = location;
    }
    if (caseId) filter.caseId = caseId;
    if (search) {
      const re = new RegExp(search, 'i');
      const normalizedSearch = normalizeRfidTag(search);
      filter.$or = [
        { fileId: re },
        { fileName: re },
        { caseId: re },
        { caseName: re },
        { rfidTag: re },
        ...(normalizedSearch ? [{ rfidTag: normalizedSearch }] : []),
      ];
    }

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    const isPaginated = req.query.page !== undefined;
    if (!isPaginated) {
      const files = await File.find(filter).sort({ updatedAt: -1 });
      return res.json({ items: files, total: files.length });
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 200);

    const [files, total] = await Promise.all([
      File.find(filter)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      File.countDocuments(filter),
    ]);

    res.json({ items: files, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) {
    next(err);
  }
}

// POST /api/files
export async function createFile(req, res, next) {
  try {
    const errors = validateFilePayload(req.body);
    if (errors.length > 0) return res.status(400).json({ errors });

    const { fileId, fileName, caseId, caseName, rfidTag, currentLocation } = req.body;
    const normalizedTag = rfidTag ? normalizeRfidTag(rfidTag) : undefined;

    const existing = await File.findOne({
      $or: [{ fileId: fileId.trim() }, ...(normalizedTag ? [{ rfidTag: normalizedTag }] : [])],
    });
    if (existing) {
      return res.status(409).json({
        error:
          existing.fileId === fileId.trim()
            ? `File ID "${fileId}" already exists`
            : `RFID tag "${normalizedTag}" is already paired with file ${existing.fileId}`,
      });
    }

    const file = await File.create({
      fileId: fileId.trim(),
      fileName: fileName.trim(),
      caseId: caseId.trim(),
      caseName: caseName ? caseName.trim() : '',
      ...(normalizedTag ? { rfidTag: normalizedTag } : {}),
      currentLocation: currentLocation || 'SHELF_ROOM',
    });

    await AuditLog.create({
      userId: req.user?._id,
      username: req.user?.username || 'system',
      action: 'FILE_CREATE',
      targetType: 'File',
      targetId: file.fileId,
      after: {
        fileId: file.fileId,
        fileName: file.fileName,
        caseId: file.caseId,
        caseName: file.caseName,
        rfidTag: file.rfidTag,
        currentLocation: file.currentLocation,
      },
    });

    res.status(201).json(file);
  } catch (err) {
    next(err);
  }
}

function normalizeHeaderKey(key) {
  return String(key || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

const HEADER_ALIASES = {
  fileid: 'fileId',
  caseid: 'caseId',
  filename: 'fileName',
  casename: 'caseName',
  rfidtag: 'rfidTag',
  rfid: 'rfidTag',
  epc: 'rfidTag',
};

function mapRow(rawRow) {
  const mapped = {};
  for (const [key, value] of Object.entries(rawRow)) {
    const canonical = HEADER_ALIASES[normalizeHeaderKey(key)];
    if (canonical) mapped[canonical] = typeof value === 'string' ? value.trim() : value;
  }
  return mapped;
}

const MAX_BULK_ROWS = 20000;

// POST /api/files/bulk-upload
export async function bulkUploadFiles(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Attach an Excel (.xlsx/.xls) file as "file".' });
    }

    let workbook;
    try {
      workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    } catch (err) {
      return res.status(400).json({ error: 'Could not read the uploaded file. Make sure it is a valid .xlsx/.xls file.' });
    }

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return res.status(400).json({ error: 'The uploaded workbook has no sheets.' });
    }

    const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
    if (rawRows.length === 0) {
      return res.status(400).json({ error: 'No data rows found in the sheet.' });
    }
    if (rawRows.length > MAX_BULK_ROWS) {
      return res.status(400).json({ error: `Sheet has ${rawRows.length} rows; max supported per upload is ${MAX_BULK_ROWS}.` });
    }

    const errors = [];
    const seenFileIds = new Set();
    const seenRfidTags = new Set();
    const candidates = [];

    rawRows.forEach((rawRow, idx) => {
      const rowNum = idx + 2;
      const row = mapRow(rawRow);

      const fileId = row.fileId ? String(row.fileId).trim() : '';
      const caseId = row.caseId ? String(row.caseId).trim() : '';
      const fileName = row.fileName ? String(row.fileName).trim() : '';
      const caseName = row.caseName ? String(row.caseName).trim() : '';
      const rfidTag = row.rfidTag ? normalizeRfidTag(row.rfidTag) : '';

      if (!fileId || !caseId || !fileName) {
        errors.push({ row: rowNum, fileId: fileId || null, reason: 'Missing FileId, CaseId, or FileName' });
        return;
      }
      if (seenFileIds.has(fileId)) {
        errors.push({ row: rowNum, fileId, reason: 'Duplicate FileId within uploaded sheet' });
        return;
      }
      if (rfidTag && seenRfidTags.has(rfidTag)) {
        errors.push({ row: rowNum, fileId, reason: 'Duplicate RFID tag within uploaded sheet' });
        return;
      }

      seenFileIds.add(fileId);
      if (rfidTag) seenRfidTags.add(rfidTag);

      candidates.push({
        rowNum,
        doc: {
          fileId,
          caseId,
          fileName,
          caseName,
          ...(rfidTag ? { rfidTag } : {}),
          currentLocation: 'SHELF_ROOM',
        },
      });
    });

    const candidateFileIds = candidates.map((c) => c.doc.fileId);
    const candidateTags = candidates.filter((c) => c.doc.rfidTag).map((c) => c.doc.rfidTag);

    const existing = await File.find(
      { $or: [{ fileId: { $in: candidateFileIds } }, ...(candidateTags.length ? [{ rfidTag: { $in: candidateTags } }] : [])] },
      { fileId: 1, rfidTag: 1 }
    );
    const existingFileIds = new Set(existing.map((f) => f.fileId));
    const existingTags = new Set(existing.map((f) => f.rfidTag).filter(Boolean));

    const toInsert = [];
    for (const { rowNum, doc } of candidates) {
      if (existingFileIds.has(doc.fileId)) {
        errors.push({ row: rowNum, fileId: doc.fileId, reason: `File ID already exists` });
        continue;
      }
      if (doc.rfidTag && existingTags.has(doc.rfidTag)) {
        errors.push({ row: rowNum, fileId: doc.fileId, reason: `RFID tag already paired with another file` });
        continue;
      }
      toInsert.push(doc);
    }

    let insertedCount = 0;
    if (toInsert.length > 0) {
      try {
        const inserted = await File.insertMany(toInsert, { ordered: false });
        insertedCount = inserted.length;
      } catch (bulkErr) {
        console.error('[bulkUploadFiles] insertMany error:', bulkErr.message);
        const writeErrors = bulkErr.writeErrors || bulkErr.result?.result?.writeErrors || [];

        if (writeErrors.length > 0) {
          insertedCount = toInsert.length - writeErrors.length;
          for (const we of writeErrors) {
            const failedDoc = toInsert[we.index];
            errors.push({
              row: null,
              fileId: failedDoc?.fileId || null,
              reason: 'Could not save this row (duplicate File ID, most likely)',
            });
          }
        } else {
          insertedCount = 0;
          errors.push({
            row: null,
            fileId: null,
            reason: `Bulk insert failed for all ${toInsert.length} row(s): ${bulkErr.message}`,
          });
        }
      }
    }

    await AuditLog.create({
      userId: req.user?._id,
      username: req.user?.username || 'system',
      action: 'FILE_BULK_IMPORT',
      targetType: 'File',
      targetId: req.file.originalname || 'bulk-upload',
      after: {
        fileName: req.file.originalname,
        totalRows: rawRows.length,
        insertedCount,
        skippedCount: rawRows.length - insertedCount,
      },
    });

    res.status(201).json({
      totalRows: rawRows.length,
      insertedCount,
      skippedCount: rawRows.length - insertedCount,
      errors: errors.slice(0, 200),
      truncatedErrorCount: Math.max(0, errors.length - 200),
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/files/:fileId
export async function getFile(req, res, next) {
  try {
    const file = await File.findOne({ fileId: req.params.fileId });
    if (!file) return res.status(404).json({ error: `File "${req.params.fileId}" not found` });

    const [history, auditTrail] = await Promise.all([
      MovementLog.find({ fileId: file.fileId }).sort({ timestamp: -1 }),
      AuditLog.find({ targetId: file.fileId }).sort({ timestamp: -1 }),
    ]);

    res.json({ file, history, auditTrail });
  } catch (err) {
    next(err);
  }
}

// PUT /api/files/:fileId
export async function updateFile(req, res, next) {
  try {
    const errors = validateFilePayload(req.body, { partial: true });
    if (errors.length > 0) return res.status(400).json({ errors });

    const file = await File.findOne({ fileId: req.params.fileId });
    if (!file) return res.status(404).json({ error: `File "${req.params.fileId}" not found` });

    if (file.archived) {
      return res.status(400).json({ error: `Cannot edit archived file "${file.fileId}". Unarchive first.` });
    }

    if (req.body.currentLocation && req.body.currentLocation !== file.currentLocation) {
      return res.status(400).json({
        error:
          'currentLocation cannot be edited directly. Location updates must happen via RFID scan events or reader simulation.',
      });
    }

    const trimmedNewTag = req.body.rfidTag ? normalizeRfidTag(req.body.rfidTag) : undefined;

    if (trimmedNewTag && trimmedNewTag !== file.rfidTag) {
      const conflict = await File.findOne({
        rfidTag: trimmedNewTag,
        _id: { $ne: file._id },
      });
      if (conflict) {
        return res.status(409).json({
          error: `RFID tag "${trimmedNewTag}" is already paired with file ${conflict.fileId}`,
        });
      }
    }

    const before = {};
    const after = {};
    const editableFields = ['fileName', 'caseId', 'caseName', 'rfidTag'];
    let hasTagChange = false;

    for (const field of editableFields) {
      if (field in req.body) {
        const newVal = typeof req.body[field] === 'string' ? req.body[field].trim() : req.body[field];
        if (newVal !== file[field]) {
          before[field] = file[field];
          after[field] = newVal;
          file[field] = newVal;

          if (field === 'rfidTag') {
            hasTagChange = true;
          }
        }
      }
    }

    if (Object.keys(after).length > 0) {
      await file.save();

      const action = hasTagChange ? 'TAG_REASSIGN' : 'FILE_UPDATE';
      await AuditLog.create({
        userId: req.user?._id,
        username: req.user?.username || 'system',
        action,
        targetType: 'File',
        targetId: file.fileId,
        before,
        after,
        reason: req.body.reason ? String(req.body.reason).trim() : '',
      });
    }

    res.json(file);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/files/:fileId
export async function deleteFile(req, res, next) {
  try {
    const rawFileId = String(req.params.fileId || '').trim();
    const file = await File.findOne({
      $or: [
        { fileId: rawFileId },
        { fileId: new RegExp(`^${rawFileId}$`, 'i') },
      ],
    });
    if (!file) return res.status(404).json({ error: `File "${rawFileId}" not found` });

    const targetFileId = file.fileId;

    await Promise.all([
      File.deleteOne({ _id: file._id }),
      MovementLog.deleteMany({ fileId: targetFileId }),
      AuditLog.deleteMany({ targetId: targetFileId }),
    ]);

    res.json({
      message: `File "${targetFileId}" and all associated data wiped successfully`,
      deletedFileId: targetFileId,
    });
  } catch (err) {
    next(err);
  }
}