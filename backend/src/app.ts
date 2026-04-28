import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { AppDataSource } from './data-source';
import { initSocket } from './service/socket.service';
import { initMQTT } from './service/mqtt.service';
import { errorMiddleware } from './middleware/error.middleware';
import apiRoutes from './routes';
import { startInvoiceScheduler } from './queue/invoice.queue';
import './queue/invoice.worker'; // registers the worker

const app  = express();
const PORT = parseInt(process.env.PORT || '4000', 10);

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check (no auth required)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// All API routes under /api
app.use('/api', apiRoutes);

// Global error handler (must be last)
app.use(errorMiddleware);

async function bootstrap() {
  // 1. Connect to PostgreSQL via TypeORM
  await AppDataSource.initialize();
  console.log('[DB] PostgreSQL connected');

  // 2. Create HTTP server
  const httpServer = createServer(app);

  // 3. Initialize Socket.io
  initSocket(httpServer);

  // 4. Initialize MQTT (after DB is ready)
  initMQTT();

  // 5. Start invoice scheduler (BullMQ repeating job)
  await startInvoiceScheduler();

  // 6. Start listening
  httpServer.listen(PORT, () => {
    console.log(`[Server] Access Control System backend running on http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('[Bootstrap] Fatal error:', err);
  process.exit(1);
});
