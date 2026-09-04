import 'dotenv/config';
import http from 'http';
import mongoose from 'mongoose';

import { createApp } from './app.js';
import { initSocket, emitMovement } from './sockets/index.js';
import { initReaderAgent } from './reader-agent/index.js';
import { processMovementBatch } from './services/movementService.js';

const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/rfid-tracker';

async function start() {
  await mongoose.connect(MONGODB_URI);
  console.log('[db] connected to MongoDB');

  const app = createApp();
  const httpServer = http.createServer(app);

  initSocket(httpServer);

  // This callback is the ONE place where a reader agent (mock or real)
  // feeds a batch into the same processing + broadcast pipeline that
  // POST /api/movements uses. Keeping this identical guarantees mock
  // and real scans are indistinguishable to the rest of the system.
  const onTagBatch = async (payload) => {
    const result = await processMovementBatch(payload);
    emitMovement(result);
    return result;
  };

  initReaderAgent(app, onTagBatch);

  httpServer.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('[server] failed to start', err);
  process.exit(1);
});
