import express from 'express';
import { ingestMovementBatch, listMovements } from '../controllers/movementController.js';

const router = express.Router();

router.post('/', ingestMovementBatch);
router.get('/', listMovements);

export default router;
