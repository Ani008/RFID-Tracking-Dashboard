import express from 'express';
import { listFiles, createFile, getFile, updateFile, deleteFile } from '../controllers/fileController.js';

const router = express.Router();

router.get('/', listFiles);
router.post('/', createFile);
router.get('/:fileId', getFile);
router.put('/:fileId', updateFile);
router.delete('/:fileId', deleteFile);

export default router;
