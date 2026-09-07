import express from 'express';
import { listGates, createGate } from '../controllers/gateController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', listGates);
router.post('/', requireRole('admin'), createGate);

export default router;
