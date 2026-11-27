import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import File from '../models/File.js';
import MovementLog from '../models/MovementLog.js';
import AuditLog from '../models/AuditLog.js';
import { normalizeRfidTag } from '../utils/rfidHelper.js';
import { mergeCaseTypes } from '../utils/caseTypes.js';

const VALID_LOCATIONS = ['SHELF_ROOM', 'COURT_ROOM', 'IN_TRANSIT'];
const VALID_CASE_STATUSES = ['PENDING', 'DISPOSED'];
const MAX_LOOKUP_TAGS = 500;
const MAX_LOCATION_LENGTH = 200;

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

  if (body.caseStatus) {
    const statusUpper = String(body.caseStatus).trim().toUpperCase();
    if (!VALID_CASE_STATUSES.includes(statusUpper)) {
      errors.push(`caseStatus must be one of ${VALID_CASE_STATUSES.join(', ')}`);
    }
  }

  if (body.storageLocation !== undefined && body.storageLocation !== null) {
    if (typeof body.storageLocation !== 'string') {
      errors.push('storageLocation must be text');
    } else if (body.storageLocation.trim().length > MAX_LOCATION_LENGTH) {
      errors.push(`Location must be ${MAX_LOCATION_LENGTH} characters or fewer`);
    }
  }

  return errors;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/files/case-types
export async function getCaseTypes(req, res, next) {
  try {
    const rawTypes = await File.distinct('caseType', {
      caseType: { $exists: true, $ne: '' },
      archived: { $ne: true },
    });
    const sorted = rawTypes
      .filter((t) => typeof t === 'string' && t.trim().length > 0)
      .map((t) => t.trim().toUpperCase())
      .filter((val, idx, arr) => arr.indexOf(val) === idx)
      .sort();
    res.json(mergeCaseTypes(sorted));
  } catch (err) {
    next(err);
  }
}

// Fields a user can type into the search box.
const SEARCH_FIELDS = [
  'fileId',
  'fileName',
  'caseId',
  'caseName',
  'caseNumber',
  'cino',
  'fileNumber',
  'storageLocation',
  'rfidTag',
];

// Turns search-box text into Mongo conditions. Every word must match at least one
// field (case-insensitive "contains"), so "income tax gupta" works even when the
// words are spread over the file name and case name. A single token that looks
// like a scanned RFID tag also matches the normalized stored tag.
function buildTextSearchConditions(raw) {
  const text = raw.trim().slice(0, 100);
  if (!text) return [];
  const tokens = [...new Set(text.split(/\s+/).filter(Boolean))].slice(0, 6);
  const normalizedTag = tokens.length === 1 ? normalizeRfidTag(text) : '';
  return tokens.map((token) => {
    const re = new RegExp(escapeRegex(token), 'i');
    return {
      $or: [
        ...SEARCH_FIELDS.map((f) => ({ [f]: re })),
        ...(normalizedTag ? [{ rfidTag: normalizedTag }] : []),
      ],
    };
  });
}

// GET /api/files/pending-mapping
export async function listPendingMappingFiles(req, res, next) {
  req.query.mapped = 'false';
  return listFiles(req, res, next);
}

// GET /api/files?mapped=&status=&caseType=&q=&page=&limit=&sort=
export async function listFiles(req, res, next) {
  try {
    const filter = { archived: { $ne: true } };
    const andConditions = [];

    // 1. location (existing parameter)
    if (req.query.location !== undefined) {
      if (typeof req.query.location !== 'string' || !VALID_LOCATIONS.includes(req.query.location)) {
        return res.status(400).json({ error: `location must be one of ${VALID_LOCATIONS.join(', ')}` });
      }
      andConditions.push({ currentLocation: req.query.location });
    }

    // 2. caseId (existing parameter)
    if (req.query.caseId !== undefined) {
      if (typeof req.query.caseId !== 'string') {
        return res.status(400).json({ error: 'caseId must be a string' });
      }
      andConditions.push({ caseId: req.query.caseId.trim() });
    }

    // 3. mapped = true | false
    if (req.query.mapped !== undefined) {
      if (typeof req.query.mapped !== 'string') {
        return res.status(400).json({ error: 'mapped must be "true" or "false"' });
      }
      const m = req.query.mapped.trim().toLowerCase();
      if (m !== 'true' && m !== 'false') {
        return res.status(400).json({ error: 'mapped must be "true" or "false"' });
      }
      if (m === 'true') {
        andConditions.push({ rfidTag: { $exists: true, $type: 'string', $gt: '' } });
      } else {
        andConditions.push({
          $or: [{ rfidTag: { $exists: false } }, { rfidTag: null }, { rfidTag: '' }],
        });
      }
    }

    // 4. status = ALL | PENDING | DISPOSED
    if (req.query.status !== undefined) {
      if (typeof req.query.status !== 'string') {
        return res.status(400).json({ error: 'status must be a string' });
      }
      const s = req.query.status.trim().toUpperCase();
      if (!['ALL', 'PENDING', 'DISPOSED'].includes(s)) {
        return res.status(400).json({ error: 'status must be one of ALL, PENDING, DISPOSED' });
      }
      if (s !== 'ALL') {
        andConditions.push({ caseStatus: s });
      }
    }

    // 5. caseType = ALL | <value>
    // Any non-empty value is accepted: configured types (e.g. WTAX, BAIL) must be
    // selectable even before a file of that type exists; the result is simply empty.
    if (req.query.caseType !== undefined) {
      if (typeof req.query.caseType !== 'string') {
        return res.status(400).json({ error: 'caseType must be a string' });
      }
      const ct = req.query.caseType.trim().toUpperCase();
      if (ct && ct !== 'ALL') {
        andConditions.push({ caseType: ct });
      }
    }

    // 6 + 7. Free-text search (`q` from Case Files / Pending Mapping, `search` from
    // other callers). Both look across every identifier on a file.
    for (const key of ['q', 'search']) {
      if (req.query[key] === undefined) continue;
      if (typeof req.query[key] !== 'string') {
        return res.status(400).json({ error: `${key} must be a string` });
      }
      andConditions.push(...buildTextSearchConditions(req.query[key]));
    }

    if (andConditions.length > 0) {
      filter.$and = andConditions;
    }

    // Sort: whitelist createdAt, caseNumber, updatedAt
    let sortOption = { createdAt: -1, _id: -1 };
    if (req.query.sort !== undefined) {
      if (typeof req.query.sort !== 'string') {
        return res.status(400).json({ error: 'sort must be a string' });
      }
      const sortKey = req.query.sort.trim();
      const ALLOWED_SORTS = {
        createdAt: { createdAt: 1, _id: 1 },
        '-createdAt': { createdAt: -1, _id: -1 },
        caseNumber: { caseNumber: 1, _id: 1 },
        '-caseNumber': { caseNumber: -1, _id: -1 },
        updatedAt: { updatedAt: 1, _id: 1 },
        '-updatedAt': { updatedAt: -1, _id: -1 },
      };
      if (!ALLOWED_SORTS[sortKey]) {
        return res.status(400).json({
          error: `Invalid sort "${sortKey}". Whitelisted fields: createdAt, caseNumber`,
        });
      }
      sortOption = ALLOWED_SORTS[sortKey];
    }

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    // Backward compatibility: If no params provided at all, return full set unpaginated
    const hasFilterOrPaging =
      req.query.page !== undefined ||
      req.query.limit !== undefined ||
      req.query.mapped !== undefined ||
      req.query.status !== undefined ||
      req.query.caseType !== undefined ||
      req.query.q !== undefined ||
      req.query.sort !== undefined ||
      req.query.location !== undefined ||
      req.query.caseId !== undefined ||
      req.query.search !== undefined;

    if (!hasFilterOrPaging) {
      const files = await File.find(filter).sort(sortOption);
      return res.json({ items: files, total: files.length, page: 1, limit: files.length });
    }

    // Page & Limit validation (limit default 20, max 100)
    if (req.query.page !== undefined && isNaN(Number(req.query.page))) {
      return res.status(400).json({ error: 'page must be a valid number' });
    }
    if (req.query.limit !== undefined && isNaN(Number(req.query.limit))) {
      return res.status(400).json({ error: 'limit must be a valid number' });
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

    const [files, total] = await Promise.all([
      File.find(filter)
        .sort(sortOption)
        .skip((page - 1) * limit)
        .limit(limit),
      File.countDocuments(filter),
    ]);

    res.json({
      items: files,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/files
export async function createFile(req, res, next) {
  try {
    const errors = validateFilePayload(req.body);
    if (errors.length > 0) return res.status(400).json({ errors });

    const {
      fileId,
      fileName,
      caseId,
      caseName,
      rfidTag,
      currentLocation,
      caseNumber,
      cino,
      fileNumber,
      caseType,
      caseStatus,
      rackLocation,
      storageLocation,
    } = req.body;

    const normalizedTag = rfidTag ? normalizeRfidTag(rfidTag) : undefined;
    const normalizedCino = cino && typeof cino === 'string' && cino.trim() ? cino.trim().toUpperCase() : undefined;

    const orConditions = [{ fileId: fileId.trim() }];
    if (normalizedTag) orConditions.push({ rfidTag: normalizedTag });
    if (normalizedCino) orConditions.push({ cino: normalizedCino });

    const existing = await File.findOne({ $or: orConditions });
    if (existing) {
      if (existing.fileId === fileId.trim()) {
        return res.status(409).json({ error: `File ID "${fileId}" already exists` });
      }
      if (normalizedTag && existing.rfidTag === normalizedTag) {
        return res.status(409).json({
          error: `RFID tag "${normalizedTag}" is already paired with file ${existing.fileId}`,
        });
      }
      if (normalizedCino && existing.cino === normalizedCino) {
        return res.status(409).json({
          error: `CINO "${normalizedCino}" is already registered with file ${existing.fileId}`,
        });
      }
    }

    const file = await File.create({
      fileId: fileId.trim(),
      fileName: fileName.trim(),
      caseId: caseId.trim(),
      caseName: caseName ? caseName.trim() : '',
      ...(normalizedTag ? { rfidTag: normalizedTag } : {}),
      ...(normalizedCino ? { cino: normalizedCino } : {}),
      ...(caseNumber ? { caseNumber: String(caseNumber).trim() } : {}),
      ...(fileNumber ? { fileNumber: String(fileNumber).trim() } : {}),
      ...(storageLocation && String(storageLocation).trim() ? { storageLocation: String(storageLocation).trim() } : {}),
      ...(caseType ? { caseType: String(caseType).trim().toUpperCase() } : {}),
      caseStatus: caseStatus ? String(caseStatus).trim().toUpperCase() : 'PENDING',
      ...(rackLocation && typeof rackLocation === 'object'
        ? {
            rackLocation: {
              rack: rackLocation.rack ? String(rackLocation.rack).trim() : '',
              shelf: rackLocation.shelf ? String(rackLocation.shelf).trim() : '',
              updatedAt: new Date(),
              updatedBy: req.user?._id,
            },
          }
        : {}),
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
        caseNumber: file.caseNumber,
        cino: file.cino,
        fileNumber: file.fileNumber,
        storageLocation: file.storageLocation,
        caseType: file.caseType,
        caseStatus: file.caseStatus,
        rackLocation: file.rackLocation,
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
  casenumber: 'caseNumber',
  caseno: 'caseNumber',
  cino: 'cino',
  filenumber: 'fileNumber',
  fileno: 'fileNumber',
  casetype: 'caseType',
  type: 'caseType',
  casestatus: 'caseStatus',
  status: 'caseStatus',
  rack: 'rack',
  shelf: 'shelf',
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
    const seenCinos = new Set();
    const candidates = [];

    rawRows.forEach((rawRow, idx) => {
      const rowNum = idx + 2;
      const row = mapRow(rawRow);

      const fileId = row.fileId ? String(row.fileId).trim() : '';
      const caseId = row.caseId ? String(row.caseId).trim() : '';
      const fileName = row.fileName ? String(row.fileName).trim() : '';
      const caseName = row.caseName ? String(row.caseName).trim() : '';
      const rfidTag = row.rfidTag ? normalizeRfidTag(row.rfidTag) : '';
      const cino = row.cino ? String(row.cino).trim().toUpperCase() : '';
      const caseNumber = row.caseNumber ? String(row.caseNumber).trim() : '';
      const fileNumber = row.fileNumber ? String(row.fileNumber).trim() : '';
      const caseType = row.caseType ? String(row.caseType).trim().toUpperCase() : '';
      const caseStatus =
        row.caseStatus && VALID_CASE_STATUSES.includes(String(row.caseStatus).trim().toUpperCase())
          ? String(row.caseStatus).trim().toUpperCase()
          : 'PENDING';
      const rack = row.rack ? String(row.rack).trim() : '';
      const shelf = row.shelf ? String(row.shelf).trim() : '';

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
      if (cino && seenCinos.has(cino)) {
        errors.push({ row: rowNum, fileId, reason: 'Duplicate CINO within uploaded sheet' });
        return;
      }

      seenFileIds.add(fileId);
      if (rfidTag) seenRfidTags.add(rfidTag);
      if (cino) seenCinos.add(cino);

      candidates.push({
        rowNum,
        doc: {
          fileId,
          caseId,
          fileName,
          caseName,
          ...(rfidTag ? { rfidTag } : {}),
          ...(cino ? { cino } : {}),
          ...(caseNumber ? { caseNumber } : {}),
          ...(fileNumber ? { fileNumber } : {}),
          ...(caseType ? { caseType } : {}),
          caseStatus,
          ...(rack || shelf ? { rackLocation: { rack, shelf, updatedAt: new Date(), updatedBy: req.user?._id } } : {}),
          currentLocation: 'SHELF_ROOM',
        },
      });
    });

    const candidateFileIds = candidates.map((c) => c.doc.fileId);
    const candidateTags = candidates.filter((c) => c.doc.rfidTag).map((c) => c.doc.rfidTag);
    const candidateCinos = candidates.filter((c) => c.doc.cino).map((c) => c.doc.cino);

    const existingConditions = [{ fileId: { $in: candidateFileIds } }];
    if (candidateTags.length > 0) existingConditions.push({ rfidTag: { $in: candidateTags } });
    if (candidateCinos.length > 0) existingConditions.push({ cino: { $in: candidateCinos } });

    const existing = await File.find(
      { $or: existingConditions },
      { fileId: 1, rfidTag: 1, cino: 1 }
    );
    const existingFileIds = new Set(existing.map((f) => f.fileId));
    const existingTags = new Set(existing.map((f) => f.rfidTag).filter(Boolean));
    const existingCinos = new Set(existing.map((f) => f.cino).filter(Boolean));

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
      if (doc.cino && existingCinos.has(doc.cino)) {
        errors.push({ row: rowNum, fileId: doc.fileId, reason: `CINO already registered with another file` });
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

// POST /api/files/lookup-tags
export async function lookupTags(req, res, next) {
  try {
    const { tags } = req.body || {};
    if (!Array.isArray(tags) || tags.length === 0) {
      return res.status(400).json({ error: 'tags must be a non-empty array of RFID tag strings' });
    }
    if (tags.length > MAX_LOOKUP_TAGS) {
      return res.status(400).json({ error: `A maximum of ${MAX_LOOKUP_TAGS} tags can be looked up at once` });
    }

    const normalized = [];
    const seen = new Set();
    for (const raw of tags) {
      if (typeof raw !== 'string') continue;
      const tag = normalizeRfidTag(raw);
      if (tag && !seen.has(tag)) {
        seen.add(tag);
        normalized.push(tag);
      }
    }
    if (normalized.length === 0) {
      return res.status(400).json({ error: 'No valid hexadecimal RFID tags were provided' });
    }

    const files = await File.find({ rfidTag: { $in: normalized } });
    const byTag = new Map(files.map((f) => [f.rfidTag, f]));

    res.set('Cache-Control', 'no-store');
    res.json({
      results: normalized.map((tag) => {
        const file = byTag.get(tag);
        return file ? { tag, found: true, file } : { tag, found: false };
      }),
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
    const trimmedNewCino =
      req.body.cino && typeof req.body.cino === 'string' && req.body.cino.trim()
        ? req.body.cino.trim().toUpperCase()
        : undefined;

    if (req.body.rfidTag && !trimmedNewTag) {
      return res.status(400).json({ error: 'rfidTag must contain hexadecimal characters (0-9, A-F)' });
    }

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

    if (trimmedNewCino && trimmedNewCino !== file.cino) {
      const conflict = await File.findOne({
        cino: trimmedNewCino,
        _id: { $ne: file._id },
      });
      if (conflict) {
        return res.status(409).json({
          error: `CINO "${trimmedNewCino}" is already registered with file ${conflict.fileId}`,
        });
      }
    }

    const before = {};
    const after = {};
    const editableFields = [
      'fileName',
      'caseId',
      'caseName',
      'rfidTag',
      'caseNumber',
      'cino',
      'fileNumber',
      'storageLocation',
      'caseType',
      'caseStatus',
    ];
    let hasTagChange = false;

    for (const field of editableFields) {
      // An empty rfidTag means "leave the tag as is", never "clear it"
      if (field === 'rfidTag' && !req.body.rfidTag) continue;
      if (field in req.body) {
        let newVal = typeof req.body[field] === 'string' ? req.body[field].trim() : req.body[field];
        if (field === 'rfidTag') newVal = normalizeRfidTag(newVal);
        if (field === 'cino' && typeof newVal === 'string') newVal = newVal.toUpperCase();
        if (field === 'caseType' && typeof newVal === 'string') newVal = newVal.toUpperCase();
        if (field === 'caseStatus' && typeof newVal === 'string') newVal = newVal.toUpperCase();

        // A file that never had a location and an empty box are the same thing
        const currentVal = field === 'storageLocation' ? file[field] || '' : file[field];
        if (newVal !== currentVal) {
          before[field] = file[field];
          after[field] = newVal;
          file[field] = newVal;

          if (field === 'rfidTag') {
            hasTagChange = true;
          }
        }
      }
    }

    if ('rackLocation' in req.body && req.body.rackLocation && typeof req.body.rackLocation === 'object') {
      const r = req.body.rackLocation;
      const newRackLoc = {
        rack: r.rack ? String(r.rack).trim() : '',
        shelf: r.shelf ? String(r.shelf).trim() : '',
        updatedAt: new Date(),
        updatedBy: req.user?._id,
      };
      const oldRackLoc = file.rackLocation ? { ...file.rackLocation.toObject?.() || file.rackLocation } : null;
      before.rackLocation = oldRackLoc;
      after.rackLocation = newRackLoc;
      file.rackLocation = newRackLoc;
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

// PUT /api/files/:fileId/rack (Admin + Staff)
export async function updateRackLocation(req, res, next) {
  try {
    const { rack, shelf } = req.body || {};
    if (rack === undefined || typeof rack !== 'string') {
      return res.status(400).json({ error: 'rack must be a string' });
    }
    const trimmedRack = rack.trim();
    if (!trimmedRack) {
      return res.status(400).json({ error: 'rack cannot be empty' });
    }
    if (trimmedRack.length > 50) {
      return res.status(400).json({ error: 'rack cannot exceed 50 characters' });
    }
    const validPattern = /^[a-zA-Z0-9\s-]+$/;
    if (!validPattern.test(trimmedRack)) {
      return res.status(400).json({ error: 'rack can only contain alphanumeric characters, spaces, and dashes' });
    }

    let trimmedShelf = '';
    if (shelf !== undefined && shelf !== null) {
      if (typeof shelf !== 'string') {
        return res.status(400).json({ error: 'shelf must be a string' });
      }
      trimmedShelf = shelf.trim();
      if (trimmedShelf.length > 50) {
        return res.status(400).json({ error: 'shelf cannot exceed 50 characters' });
      }
      if (trimmedShelf && !validPattern.test(trimmedShelf)) {
        return res.status(400).json({ error: 'shelf can only contain alphanumeric characters, spaces, and dashes' });
      }
    }

    const rawId = String(req.params.fileId || '').trim();
    if (!rawId) return res.status(400).json({ error: 'fileId is required' });

    const query = mongoose.Types.ObjectId.isValid(rawId)
      ? { $or: [{ _id: rawId }, { fileId: rawId }] }
      : { fileId: rawId };

    const file = await File.findOne(query);
    if (!file) return res.status(404).json({ error: `File "${rawId}" not found` });

    const before = file.rackLocation ? (file.rackLocation.toObject?.() || { ...file.rackLocation }) : null;
    const newRackLoc = {
      rack: trimmedRack,
      shelf: trimmedShelf,
      updatedAt: new Date(),
      updatedBy: req.user?._id,
    };

    file.rackLocation = newRackLoc;
    await file.save();

    await AuditLog.create({
      userId: req.user?._id,
      username: req.user?.username || 'system',
      action: 'RACK_UPDATE',
      targetType: 'File',
      targetId: file.fileId,
      before: { rackLocation: before },
      after: { rackLocation: newRackLoc },
    });

    res.json(file);
  } catch (err) {
    next(err);
  }
}


//for android app to locate files without need of login 
export async function locateFile(req, res) {
  try {
    // Optional shared key. Only enforced when DEVICE_KEY is set in the backend .env
    const requiredKey = process.env.DEVICE_KEY;
    if (requiredKey && req.get('x-device-key') !== requiredKey) {
      return res.status(401).json({ message: 'Device not authorised' });
    }

    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ message: 'q is required' });

    const exact = new RegExp(`^${escapeRegex(q)}$`, 'i');
    const tagForm = q.replace(/[^0-9a-fA-F]/g, '').toUpperCase(); // same cleanup as tag registration

    const or = [{ fileId: exact }, { caseId: exact }];
    if (tagForm) or.push({ rfidTag: tagForm });

    const doc = await File.findOne({ $or: or })
      .select('fileId fileName caseId rfidTag storageLocation')
      .lean();

    // Same shape the app already understands: { items: [...] }
    return res.json({ items: doc ? [doc] : [] });
  } catch (err) {
    return res.status(500).json({ message: 'Lookup failed' });
  }
}
