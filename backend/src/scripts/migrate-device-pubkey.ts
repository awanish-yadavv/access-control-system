/**
 * One-time migration: adds public_key column to system.devices.
 * Safe to run multiple times (ADD COLUMN IF NOT EXISTS).
 */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { AppDataSource } from '../data-source';

async function run() {
  await AppDataSource.initialize();
  console.log('[MigrateDevicePubKey] Connected');

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();

  try {
    await queryRunner.startTransaction();
    await queryRunner.query(
      `ALTER TABLE system.devices ADD COLUMN IF NOT EXISTS public_key TEXT NULL`,
    );
    await queryRunner.commitTransaction();
    console.log('[MigrateDevicePubKey] ✓ public_key column added to system.devices');
  } catch (err) {
    await queryRunner.rollbackTransaction();
    console.error('[MigrateDevicePubKey] ✗ Failed:', err);
    throw err;
  } finally {
    await queryRunner.release();
  }

  await AppDataSource.destroy();
  console.log('[MigrateDevicePubKey] Done ✓');
}

run().catch((err) => {
  console.error('[MigrateDevicePubKey] Fatal:', err);
  process.exit(1);
});
