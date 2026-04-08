/**
 * One-time migration script: upgrades existing tenant schemas with
 * new billing columns and Tier 2 tables.
 * Safe to run multiple times (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
 */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { AppDataSource } from '../data-source';
import { Tenant } from '../tenant/tenant.entity';
import { tenantSchemaName } from '../service/tenant-schema.service';

async function migrateTenant(tenantId: string): Promise<void> {
  const schema = tenantSchemaName(tenantId);
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  try {
    await queryRunner.startTransaction();

    // ── Human-readable ID sequences ──────────────────────────────────────
    await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS "${schema}".member_code_seq       START 1`);
    await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS "${schema}".subscription_code_seq START 1`);
    await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS "${schema}".invoice_code_seq      START 1`);

    // ── Add code columns to existing tables (nullable first for backfill) ─
    await queryRunner.query(`ALTER TABLE "${schema}".my_customers          ADD COLUMN IF NOT EXISTS code VARCHAR(20)`);
    await queryRunner.query(`ALTER TABLE "${schema}".customer_subscriptions ADD COLUMN IF NOT EXISTS code VARCHAR(20)`);
    await queryRunner.query(`ALTER TABLE "${schema}".customer_invoices      ADD COLUMN IF NOT EXISTS code VARCHAR(20)`);

    // ── Backfill codes for existing rows that have none ──────────────────
    await queryRunner.query(`
      UPDATE "${schema}".my_customers
      SET code = 'MEM-' || LPAD(nextval('"${schema}".member_code_seq')::text, 4, '0')
      WHERE code IS NULL
    `);
    await queryRunner.query(`
      UPDATE "${schema}".customer_subscriptions
      SET code = 'SUB-' || LPAD(nextval('"${schema}".subscription_code_seq')::text, 4, '0')
      WHERE code IS NULL
    `);
    await queryRunner.query(`
      UPDATE "${schema}".customer_invoices
      SET code = 'INV-' || LPAD(nextval('"${schema}".invoice_code_seq')::text, 4, '0')
      WHERE code IS NULL
    `);

    // ── Enforce NOT NULL + UNIQUE after backfill ──────────────────────────
    await queryRunner.query(`ALTER TABLE "${schema}".my_customers           ALTER COLUMN code SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "${schema}".customer_subscriptions  ALTER COLUMN code SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "${schema}".customer_invoices       ALTER COLUMN code SET NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uidx_my_customers_code          ON "${schema}".my_customers(code)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uidx_customer_subscriptions_code ON "${schema}".customer_subscriptions(code)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uidx_customer_invoices_code      ON "${schema}".customer_invoices(code)`);

    // ── Subscription lifecycle columns ────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "${schema}".customer_subscriptions
        DROP CONSTRAINT IF EXISTS customer_subscriptions_status_check
    `);
    await queryRunner.query(`
      ALTER TABLE "${schema}".customer_subscriptions
        ADD CONSTRAINT customer_subscriptions_status_check
        CHECK (status IN ('active','expired','cancelled','terminated'))
    `);
    await queryRunner.query(`ALTER TABLE "${schema}".customer_subscriptions ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMPTZ NULL`);
    await queryRunner.query(`ALTER TABLE "${schema}".customer_subscriptions ADD COLUMN IF NOT EXISTS cancelled_at      TIMESTAMPTZ NULL`);

    // ── Enhance existing subscriptions table ──────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "${schema}".subscriptions
        ADD COLUMN IF NOT EXISTS starts_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20)  NOT NULL DEFAULT 'monthly',
        ADD COLUMN IF NOT EXISTS notes         TEXT NULL
    `);

    // ── Enhance existing invoices table ───────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "${schema}".invoices
        ADD COLUMN IF NOT EXISTS subscription_id UUID NULL
          REFERENCES "${schema}".subscriptions(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS description TEXT NULL,
        ADD COLUMN IF NOT EXISTS due_date    TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS paid_at     TIMESTAMPTZ NULL
    `);

    // ── Tier 2: membership plans ──────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".membership_plans (
        id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        name          VARCHAR(255)  NOT NULL,
        price         NUMERIC(10,2) NOT NULL,
        billing_cycle VARCHAR(20)   NOT NULL DEFAULT 'monthly'
                      CHECK (billing_cycle IN ('daily','monthly','quarterly','half_year','annual','one_time','custom')),
        features      JSONB         NOT NULL DEFAULT '{}',
        is_active     BOOLEAN       NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);

    // ── Expand billing_cycle constraint for existing membership_plans ─────
    await queryRunner.query(`
      ALTER TABLE "${schema}".membership_plans
        DROP CONSTRAINT IF EXISTS membership_plans_billing_cycle_check
    `);
    await queryRunner.query(`
      ALTER TABLE "${schema}".membership_plans
        ADD CONSTRAINT membership_plans_billing_cycle_check
        CHECK (billing_cycle IN ('daily','monthly','quarterly','half_year','annual','one_time','custom'))
    `);
    // ── GST columns for membership_plans ─────────────────────────────────
    await queryRunner.query(`ALTER TABLE "${schema}".membership_plans ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5,2) NULL`);

    // ── Tier 2: customer subscriptions ───────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".customer_subscriptions (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID        NOT NULL REFERENCES system.users(id) ON DELETE CASCADE,
        plan_id     UUID        NOT NULL REFERENCES "${schema}".membership_plans(id) ON DELETE RESTRICT,
        status      VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','expired','cancelled')),
        starts_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at  TIMESTAMPTZ NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_customer_subs_customer
        ON "${schema}".customer_subscriptions(customer_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_customer_subs_plan
        ON "${schema}".customer_subscriptions(plan_id)
    `);

    // ── Tier 2: customer invoices ─────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".customer_invoices (
        id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id     UUID          NOT NULL REFERENCES system.users(id) ON DELETE CASCADE,
        subscription_id UUID          NULL
                        REFERENCES "${schema}".customer_subscriptions(id) ON DELETE SET NULL,
        amount          NUMERIC(10,2) NOT NULL,
        description     TEXT          NULL,
        status          VARCHAR(20)   NOT NULL DEFAULT 'unpaid'
                        CHECK (status IN ('unpaid','paid','void')),
        due_date        TIMESTAMPTZ   NULL,
        paid_at         TIMESTAMPTZ   NULL,
        created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_customer_inv_customer
        ON "${schema}".customer_invoices(customer_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_customer_inv_sub
        ON "${schema}".customer_invoices(subscription_id)
    `);
    // ── GST columns for customer_invoices ────────────────────────────────
    await queryRunner.query(`ALTER TABLE "${schema}".customer_invoices ADD COLUMN IF NOT EXISTS gst_rate   NUMERIC(5,2)  NULL`);
    await queryRunner.query(`ALTER TABLE "${schema}".customer_invoices ADD COLUMN IF NOT EXISTS gst_amount NUMERIC(10,2) NULL`);
    await queryRunner.query(`ALTER TABLE "${schema}".customer_invoices ADD COLUMN IF NOT EXISTS notes      TEXT          NULL`);

    await queryRunner.commitTransaction();
    console.log(`[Migrate] ✓ ${schema}`);
  } catch (err) {
    await queryRunner.rollbackTransaction();
    console.error(`[Migrate] ✗ ${schema}:`, err);
    throw err;
  } finally {
    await queryRunner.release();
  }
}

async function run() {
  await AppDataSource.initialize();
  console.log('[Migrate] Connected');

  const tenants = await AppDataSource.getRepository(Tenant).find();
  console.log(`[Migrate] Found ${tenants.length} tenant(s)`);

  for (const tenant of tenants) {
    await migrateTenant(tenant.id);
  }

  await AppDataSource.destroy();
  console.log('[Migrate] Done ✓');
}

run().catch((err) => {
  console.error('[Migrate] Failed:', err);
  process.exit(1);
});
