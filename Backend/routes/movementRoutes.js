import express from 'express';
import { ingestMovementBatch, listMovements } from '../controllers/movementController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.post('/', ingestMovementBatch);
router.get('/', requireAuth, listMovements);

export default router;
