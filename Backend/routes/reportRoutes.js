import express from 'express';
import { courtRoomFiles, shelfRoomFiles, unknownTags } from '../controllers/reportController.js';

const router = express.Router();

router.get('/court-room-files', courtRoomFiles);
router.get('/shelf-room-files', shelfRoomFiles);
router.get('/unknown-tags', unknownTags);

export default router;
