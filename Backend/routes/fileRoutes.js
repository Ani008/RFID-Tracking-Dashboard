import express from 'express';
import { listFiles, createFile, getFile, updateFile, deleteFile } from '../controllers/fileController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', listFiles);
router.get('/:fileId', getFile);

// Admin-only file management actions
router.post('/', requireRole('admin'), createFile);
router.put('/:fileId', requireRole('admin'), updateFile);
router.delete('/:fileId', requireRole('admin'), deleteFile);

export default router;
