import File from '../models/File.js';
import MovementLog from '../models/MovementLog.js';

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

  if (body.currentLocation && !VALID_LOCATIONS.includes(body.currentLocation)) {
    errors.push(`currentLocation must be one of ${VALID_LOCATIONS.join(', ')}`);
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
            ? `fileId "${fileId}" already exists`
            : `rfidTag "${rfidTag}" is already paired with another file`,
      });
    }

    const file = await File.create({
      fileId,
      fileName,
      caseId,
      caseName,
      rfidTag,
      currentLocation: currentLocation || 'SHELF_ROOM',
    });

    res.status(201).json(file);
  } catch (err) {
    next(err);
  }
}

// GET /api/files/:fileId  -> file detail + movement history
export async function getFile(req, res, next) {
  try {
    const file = await File.findOne({ fileId: req.params.fileId });
    if (!file) return res.status(404).json({ error: `File "${req.params.fileId}" not found` });

    const history = await MovementLog.find({ fileId: file.fileId }).sort({ timestamp: -1 });

    res.json({ file, history });
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

    // Guard against rfidTag collisions with a different file.
    if (req.body.rfidTag && req.body.rfidTag !== file.rfidTag) {
      const conflict = await File.findOne({ rfidTag: req.body.rfidTag, fileId: { $ne: file.fileId } });
      if (conflict) {
        return res.status(409).json({ error: `rfidTag "${req.body.rfidTag}" is already paired with another file` });
      }
    }

    const editable = ['fileName', 'caseId', 'caseName', 'rfidTag', 'currentLocation'];
    for (const field of editable) {
      if (field in req.body) file[field] = req.body[field];
    }

    await file.save();
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

    res.json({ message: `File "${file.fileId}" archived`, file });
  } catch (err) {
    next(err);
  }
}
