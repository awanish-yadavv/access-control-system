/**
 * One-time system migration: adds GST columns to system.tenants
 * and creates system.settings table with default GST seed.
 * Safe to run multiple times (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
 */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { AppDataSource } from '../data-source';

async function run() {
  await AppDataSource.initialize();
  console.log('[MigrateSystem] Connected');

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();

  try {
    await queryRunner.startTransaction();

    // ── GST columns on system.tenants ────────────────────────────────────
    await queryRunner.query(`ALTER TABLE system.tenants ADD COLUMN IF NOT EXISTS email          VARCHAR(255)`);
    await queryRunner.query(`ALTER TABLE system.tenants ADD COLUMN IF NOT EXISTS phone          VARCHAR(50)`);
    await queryRunner.query(`ALTER TABLE system.tenants ADD COLUMN IF NOT EXISTS gst_enabled    BOOLEAN      NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE system.tenants ADD COLUMN IF NOT EXISTS gst_type       VARCHAR(10)  NOT NULL DEFAULT 'cgst_sgst'`);
    await queryRunner.query(`ALTER TABLE system.tenants ADD COLUMN IF NOT EXISTS gstin          VARCHAR(15)  NULL`);
    await queryRunner.query(`ALTER TABLE system.tenants ADD COLUMN IF NOT EXISTS gst_legal_name VARCHAR(255) NULL`);
    await queryRunner.query(`ALTER TABLE system.tenants ADD COLUMN IF NOT EXISTS gst_pan        VARCHAR(10)  NULL`);
    await queryRunner.query(`ALTER TABLE system.tenants ADD COLUMN IF NOT EXISTS gst_rate       NUMERIC(5,2) NOT NULL DEFAULT 18.00`);
    await queryRunner.query(`ALTER TABLE system.tenants ADD COLUMN IF NOT EXISTS gst_address    TEXT         NULL`);
    await queryRunner.query(`ALTER TABLE system.tenants ADD COLUMN IF NOT EXISTS gst_state      VARCHAR(100) NULL`);
    await queryRunner.query(`ALTER TABLE system.tenants ADD COLUMN IF NOT EXISTS gst_state_code VARCHAR(2)   NULL`);

    // ── system.settings table ────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS system.settings (
        key        VARCHAR(100) PRIMARY KEY,
        value      JSONB        NOT NULL DEFAULT '{}',
        updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      INSERT INTO system.settings (key, value)
      VALUES ('gst', '{"defaultRate": 18, "platformGstin": null, "platformLegalName": null, "platformAddress": null}')
      ON CONFLICT (key) DO NOTHING
    `);

    await queryRunner.commitTransaction();
    console.log('[MigrateSystem] ✓ system.tenants GST columns added');
    console.log('[MigrateSystem] ✓ system.settings table ready');
  } catch (err) {
    await queryRunner.rollbackTransaction();
    console.error('[MigrateSystem] ✗ Failed:', err);
    throw err;
  } finally {
    await queryRunner.release();
  }

  await AppDataSource.destroy();
  console.log('[MigrateSystem] Done ✓');
}

run().catch((err) => {
  console.error('[MigrateSystem] Fatal:', err);
  process.exit(1);
});
