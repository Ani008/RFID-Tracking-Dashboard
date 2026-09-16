import express from 'express';
import multer from 'multer';
import {
  listFiles,
  createFile,
  getFile,
  updateFile,
  deleteFile,
  bulkUploadFiles,
} from '../controllers/fileController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();

const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'text/csv',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }, // 10MB is plenty for 5k rows
  fileFilter: (req, file, cb) => {
    const isAllowedMime = ALLOWED_MIME_TYPES.has(file.mimetype);
    const isAllowedExt = /\.(xlsx|xls|csv)$/i.test(file.originalname || '');
    if (isAllowedMime || isAllowedExt) return cb(null, true);
    cb(new Error('Only .xlsx, .xls, or .csv files are supported'));
  },
});

router.use(requireAuth);

router.get('/', listFiles);
router.get('/:fileId', getFile);

// Admin-only file management actions
router.post('/', requireRole('admin'), createFile);
router.post('/bulk-upload', requireRole('admin'), upload.single('file'), bulkUploadFiles);
router.put('/:fileId', requireRole('admin'), updateFile);
router.delete('/:fileId', requireRole('admin'), deleteFile);

export default router;