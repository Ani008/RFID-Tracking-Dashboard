import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import movementRoutes from './routes/movementRoutes.js';
import fileRoutes from './routes/fileRoutes.js';
import gateRoutes from './routes/gateRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
  app.use(express.json());
  app.use(morgan('dev'));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.use('/api/movements', movementRoutes);
  app.use('/api/files', fileRoutes);
  app.use('/api/gates', gateRoutes);
  app.use('/api/reports', reportRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
