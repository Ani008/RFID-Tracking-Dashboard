import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import movementRoutes from './routes/movementRoutes.js';
import fileRoutes from './routes/fileRoutes.js';
import gateRoutes from './routes/gateRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import path from 'path';
import { fileURLToPath } from 'url';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import publicRoutes from './routes/publicRoutes.js';

export function createApp() {
  const app = express();

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  app.use('/api/public', publicRoutes);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(YAML.load(path.join(__dirname, 'docs/openapi.yaml'))));

  // Security HTTP Headers
  app.use(helmet());
  

  // Strict CORS policy
  const allowedOrigin = process.env.CLIENT_URL || 'http://localhost:5173';
  app.use(
    cors({
      origin: allowedOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // Request Body Size Limit (prevents memory payload exhaustion)
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan('dev'));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/movements', movementRoutes);
  app.use('/api/files', fileRoutes);
  app.use('/api/gates', gateRoutes);
  app.use('/api/reports', reportRoutes);

  return app;
}

// Call this ONLY after every other route (including the reader-agent's
// /api/simulate) has been mounted on the app — these must be last.
export function finalizeApp(app) {
  app.use(notFoundHandler);
  app.use(errorHandler);
}