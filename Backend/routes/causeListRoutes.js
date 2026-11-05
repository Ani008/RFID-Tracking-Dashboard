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
} from '../controllers/causeListController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

router.use(requireAuth);

// Admin-only operations
router.post('/sync', requireRole('admin'), upload.single('file'), triggerSync);
router.post('/sync/:runId/retry', requireRole('admin'), retrySyncRun);
router.post('/rematch', requireRole('admin'), triggerRematch);

// Admin & Staff read operations
router.get('/sync-runs', listSyncRuns);
router.get('/sync-runs/:id', getSyncRun);
router.get('/unmatched', listUnmatchedEntries);
router.get('/history/:cino', getCaseHistory);
router.get('/', listCauseListEntries);

export default router;

