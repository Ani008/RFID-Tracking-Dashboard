import express from 'express';
import { getHandheldCauseList } from '../controllers/handheldController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

// GET /api/handheld/causelist (admin + staff)
router.get('/causelist', getHandheldCauseList);

export default router;

