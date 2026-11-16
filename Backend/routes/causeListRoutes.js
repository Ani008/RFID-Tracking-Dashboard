import express from 'express';
import multer from 'multer';
import {
  triggerSync,
  retrySyncRun,
  triggerRematch,
  listSyncRuns,
  getSyncRun,
  listCauseListEntries,
  listUnmatchedEntries,
  getCaseHistory,
  listCauseListCaseTypes,
} from '../controllers/causeListController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const isAllowedExt = /\.(xlsx|xls|csv|json)$/i.test(file.originalname || '');
    if (isAllowedExt) return cb(null, true);
    cb(new Error('Only .xlsx, .xls, .csv, or .json files are supported'));
  },
});

router.use(requireAuth);

// Admin-only operations
router.post('/sync', requireRole('admin'), upload.single('file'), triggerSync);
router.post('/sync/:runId/retry', requireRole('admin'), retrySyncRun);
router.post('/rematch', requireRole('admin'), triggerRematch);

// Admin & Staff read operations
router.get('/case-types', listCauseListCaseTypes);
router.get('/sync-runs', listSyncRuns);
router.get('/sync-runs/:id', getSyncRun);
router.get('/unmatched', listUnmatchedEntries);
router.get('/history/:cino', getCaseHistory);
router.get('/', listCauseListEntries);

export default router;

