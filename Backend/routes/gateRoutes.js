import express from 'express';
import { listGates, createGate } from '../controllers/gateController.js';

const router = express.Router();

router.get('/', listGates);
router.post('/', createGate);

export default router;
