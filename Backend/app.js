import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';

import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import movementRoutes from './routes/movementRoutes.js';
import fileRoutes from './routes/fileRoutes.js';
import gateRoutes from './routes/gateRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import publicRoutes from './routes/publicRoutes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  app.use('/api/public', publicRoutes);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(YAML.load(path.join(__dirname, 'docs/openapi.yaml'))));

  // Security HTTP Headers
  app.use(helmet());

  // Dynamic CORS policy: supports localhost, local LAN IPs, and explicit CLIENT_URL
  const corsOriginCheck = (origin, callback) => {
    // Allow non-browser requests (mobile native apps, curl, server-to-server)
    if (!origin) return callback(null, true);

    const configured = process.env.CLIENT_URL;
    if (configured && origin === configured) return callback(null, true);

    // Allow localhost and 127.0.0.1 on any port (5173, 5174, etc.)
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }

    // Allow private local network IPs on any port (192.168.x.x, 172.16-31.x.x, 10.x.x.x)
    if (/^https?:\/\/(192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  };

  app.use(
    cors({
      origin: corsOriginCheck,
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
