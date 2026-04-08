import { Redis } from 'ioredis';

export const redisConnection = new Redis({
  host: process.env.REDIS_HOST ?? '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT ?? '6379'),
  maxRetriesPerRequest: null, // required by BullMQ
  enableReadyCheck: false,
});

redisConnection.on('connect', () => console.log('[Redis] Connected to Valkey'));
redisConnection.on('error',   (err) => console.error('[Redis] Error:', err.message));
