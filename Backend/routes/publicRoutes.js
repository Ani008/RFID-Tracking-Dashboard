// Backend/routes/publicRoutes.js
// Read-only, token-free API for Dashboard B. Only GET/HEAD/OPTIONS are allowed.
// Mounted at /api/public (see app.js change below). Existing /api/* routes stay JWT-protected.
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import File from '../models/File.js';
import MovementLog from '../models/MovementLog.js';
import { listFiles } from '../controllers/fileController.js';
import { listGates } from '../controllers/gateController.js';
import { listMovements } from '../controllers/movementController.js';
import {
  courtRoomFiles,
  shelfRoomFiles,
  movementReport,
  unknownTags,
  caseSummary,
  exportReportCsv,
} from '../controllers/reportController.js';

const router = express.Router();

// Open CORS for GET + allow other origins to read responses in the browser
router.use(cors({ origin: '*', methods: ['GET', 'HEAD', 'OPTIONS'] }));
router.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
router.use(morgan('combined'));

// Hard read-only guard
router.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  res.set('Allow', 'GET, HEAD, OPTIONS');
  res.status(405).json({ error: 'Method not allowed. This API is read-only (GET).' });
});

// No token, so protect the server from abuse: 120 requests / minute / IP
router.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down.' },
  })
);

// `search` is turned into new RegExp(...) by the controllers: escape it on the open API
router.use((req, res, next) => {
  if ('search' in req.query) {
    req.query.search =
      typeof req.query.search === 'string'
        ? req.query.search.slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        : undefined;
  }
  next();
});

// ---- Files ----
router.get('/files', listFiles);

// Same as /api/files/:fileId but WITHOUT the internal auditTrail (usernames, before/after snapshots)
router.get('/files/:fileId', async (req, res, next) => {
  try {
    const file = await File.findOne({ fileId: req.params.fileId });
    if (!file) return res.status(404).json({ error: `File "${req.params.fileId}" not found` });
    const history = await MovementLog.find({ fileId: file.fileId }).sort({ timestamp: -1 }).limit(200);
    res.json({ file, history });
  } catch (err) {
    next(err);
  }
});

// ---- Gates & movements ----
router.get('/gates', listGates);
router.get('/movements', listMovements);

// ---- Reports ----
router.get('/reports/court-room-files', courtRoomFiles);
router.get('/reports/shelf-room-files', shelfRoomFiles);
router.get('/reports/movements', movementReport);
router.get('/reports/unknown-tags', unknownTags);
router.get('/reports/case/:caseId', caseSummary);
router.get('/reports/:type/export', exportReportCsv);

export default router;

/* ---------- Backend/app.js: 2 changes ----------
1) import publicRoutes from './routes/publicRoutes.js';

2) Mount it FIRST inside createApp(), right after `const app = express();`
   (before the global helmet/cors so the strict CLIENT_URL CORS doesn't apply to it):

   app.use('/api/public', publicRoutes);
*/