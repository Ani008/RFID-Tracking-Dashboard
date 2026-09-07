import File from '../models/File.js';
import MovementLog from '../models/MovementLog.js';
import AuditLog from '../models/AuditLog.js';

const VALID_LOCATIONS = ['SHELF_ROOM', 'COURT_ROOM', 'IN_TRANSIT'];

function validateFilePayload(body, { partial = false } = {}) {
  const errors = [];
  const required = ['fileId', 'fileName', 'caseId', 'caseName', 'rfidTag'];

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

// GET /api/files?location=&caseId=&search=
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
      filter.$or = [{ fileId: re }, { fileName: re }, { caseId: re }, { caseName: re }, { rfidTag: re }];
    }

    const files = await File.find(filter).sort({ updatedAt: -1 });
    res.json({ items: files, total: files.length });
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

    const existing = await File.findOne({ $or: [{ fileId }, { rfidTag }] });
    if (existing) {
      return res.status(409).json({
        error:
          existing.fileId === fileId
            ? `File ID "${fileId}" already exists`
            : `RFID tag "${rfidTag}" is already paired with file ${existing.fileId}`,
      });
    }

    const file = await File.create({
      fileId: fileId.trim(),
      fileName: fileName.trim(),
      caseId: caseId.trim(),
      caseName: caseName.trim(),
      rfidTag: rfidTag.trim(),
      currentLocation: currentLocation || 'SHELF_ROOM',
    });

    // Audit log
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

// GET /api/files/:fileId  -> file detail + movement history + audit trail
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

// PUT /api/files/:fileId -> Hardened metadata edit (admin-only)
export async function updateFile(req, res, next) {
  try {
    const errors = validateFilePayload(req.body, { partial: true });
    if (errors.length > 0) return res.status(400).json({ errors });

    const file = await File.findOne({ fileId: req.params.fileId });
    if (!file) return res.status(404).json({ error: `File "${req.params.fileId}" not found` });

    if (file.archived) {
      return res.status(400).json({ error: `Cannot edit archived file "${file.fileId}". Unarchive first.` });
    }

    // Explicitly reject direct location manipulation through metadata edit
    if (req.body.currentLocation && req.body.currentLocation !== file.currentLocation) {
      return res.status(400).json({
        error:
          'currentLocation cannot be edited directly. Location updates must happen via RFID scan events or reader simulation.',
      });
    }

    const trimmedNewTag = req.body.rfidTag ? req.body.rfidTag.trim() : undefined;

    // Check duplicate rfidTag across other files
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

    // Capture before snapshot of fields changing
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

    // Only proceed with save and audit log if changes were made
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

// DELETE /api/files/:fileId  -> soft delete (archive)
export async function deleteFile(req, res, next) {
  try {
    const file = await File.findOne({ fileId: req.params.fileId });
    if (!file) return res.status(404).json({ error: `File "${req.params.fileId}" not found` });

    file.archived = true;
    await file.save();

    await AuditLog.create({
      userId: req.user?._id,
      username: req.user?.username || 'system',
      action: 'FILE_ARCHIVE',
      targetType: 'File',
      targetId: file.fileId,
      before: { archived: false },
      after: { archived: true },
    });

    res.json({ message: `File "${file.fileId}" archived`, file });
  } catch (err) {
    next(err);
  }
}
