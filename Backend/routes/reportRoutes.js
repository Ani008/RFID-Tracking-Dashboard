import express from 'express';
import {
  courtRoomFiles,
  shelfRoomFiles,
  movementReport,
  unknownTags,
  caseSummary,
  exportReportCsv,
} from '../controllers/reportController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

router.get('/court-room-files', courtRoomFiles);
router.get('/shelf-room-files', shelfRoomFiles);
router.get('/movements', movementReport);
router.get('/unknown-tags', unknownTags);
router.get('/case/:caseId', caseSummary);
router.get('/:type/export', exportReportCsv);

export default router;
