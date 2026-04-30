import { AppDataSource } from '../data-source';
import * as fs from 'fs';
import * as path from 'path';

// Converts UUID "abc-123-..." → "abc123..." (for use as schema name suffix)
function toSchemaId(tenantId: string): string {
  return tenantId.replace(/-/g, '');
}

export function tenantSchemaName(tenantId: string): string {
  return `tenant_${toSchemaId(tenantId)}`;
}

/**
 * Provision a new tenant's schema and tables.
 * Called when SYSTEM creates a new tenant.
 */
export async function provisionTenantSchema(tenantId: string): Promise<void> {
  const schema = tenantSchemaName(tenantId);
  const templatePath = path.resolve(__dirname, '../../migrations/002_TenantSchemaTemplate.sql');
  let sql = fs.readFileSync(templatePath, 'utf-8');

  // Replace the placeholder with the actual schema-safe tenant id
  sql = sql.replace(/:tenantId/g, toSchemaId(tenantId));

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  try {
    await queryRunner.startTransaction();
    // Execute each statement individually (split on semicolons, skip empty)
    const statements = sql.split(';').map((s) => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await queryRunner.query(stmt);
    }
    await queryRunner.commitTransaction();
    console.log(`[TenantSchema] Provisioned schema: ${schema}`);
  } catch (err) {
    await queryRunner.rollbackTransaction();
    throw err;
  } finally {
    await queryRunner.release();
  }
}

/**
 * Drop a tenant's entire schema (used when deprovisioning a tenant).
 */
export async function dropTenantSchema(tenantId: string): Promise<void> {
  const schema = tenantSchemaName(tenantId);
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  try {
    await queryRunner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    console.log(`[TenantSchema] Dropped schema: ${schema}`);
  } finally {
    await queryRunner.release();
  }
}

/**
 * Run a query scoped to a tenant's schema.
 * Sets search_path to the tenant schema + system for the duration of the query.
 */
export async function queryTenantSchema<T = unknown>(
  tenantId: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const schema = tenantSchemaName(tenantId);
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  try {
    await queryRunner.query(`SET search_path TO "${schema}", system, public`);
    const result = await queryRunner.query(sql, params as never[]);
    return result as T[];
  } finally {
    await queryRunner.release();
  }
}

// ── Typed helpers for tenant-scoped tables ──────────────────────────────────

export interface TenantDevice {
  id: string;
  device_id: string;
  label: string | null;
  notes: string | null;
  assigned_at: Date;
  // joined from system.devices
  mac_address?: string;
  name?: string;
  status?: string;
  last_seen?: Date;
}

export interface TenantCard {
  id: string;
  card_id: string;
  customer_id: string | null;
  label: string | null;
  issued_at: Date;
  // joined from system.cards
  uid?: string;
  card_status?: string;
  // joined from system.users
  customer_email?: string | null;
}

export interface TenantSubscription {
  id: string;
  plan_id: string;
  plan_name?: string;
  plan_price?: number;
  status: string;
  starts_at?: Date;
  billing_cycle?: string;
  expires_at: Date | null;
  notes?: string | null;
  created_at: Date;
}

export interface TenantInvoice {
  id: string;
  subscription_id?: string | null;
  amount: number;
  description?: string | null;
  status: string;
  due_date?: Date | null;
  paid_at?: Date | null;
  created_at: Date;
}

export interface MembershipPlan {
  id: string;
  name: string;
  price: number;
  billing_cycle: string;
  features: Record<string, unknown>;
  gst_rate: number | null;
  is_active: boolean;
  created_at: Date;
}

export interface CustomerSubscription {
  id: string;
  code: string;      // SUB-0001
  customer_id: string;
  customer_email?: string;
  plan_id: string;
  plan_name?: string;
  plan_price?: number;
  status: 'active' | 'expired' | 'cancelled' | 'terminated';
  starts_at: Date;
  expires_at: Date | null;
  next_billing_date: Date | null;
  cancelled_at: Date | null;
  created_at: Date;
}

export interface CustomerInvoice {
  id: string;
  code: string;      // INV-0001
  customer_id: string;
  customer_name?: string | null;
  customer_email?: string;
  subscription_id: string | null;
  amount: number;
  gst_rate: number | null;
  gst_amount: number | null;
  description: string | null;
  notes: string | null;
  status: string;
  due_date: Date | null;
  paid_at: Date | null;
  created_at: Date;
}

export async function getTenantDevices(tenantId: string): Promise<TenantDevice[]> {
  const schema = tenantSchemaName(tenantId);
  return queryTenantSchema<TenantDevice>(
    tenantId,
    `SELECT md.*, d.mac_address, d.name, d.status, d.last_seen
     FROM "${schema}".my_devices md
     INNER JOIN system.devices d ON d.id = md.device_id
     ORDER BY md.assigned_at DESC`,
  );
}

export async function getTenantCards(tenantId: string): Promise<TenantCard[]> {
  const schema = tenantSchemaName(tenantId);
  return queryTenantSchema<TenantCard>(
    tenantId,
    `SELECT mc.*, c.uid, c.status AS card_status, u.email AS customer_email
     FROM "${schema}".my_cards mc
     INNER JOIN system.cards c ON c.id = mc.card_id
     LEFT JOIN system.users u ON u.id = mc.customer_id
     ORDER BY mc.issued_at DESC`,
  );
}

export async function updateTenantCard(
  tenantId: string,
  myCardId: string,
  updates: { customerId?: string | null; label?: string | null },
): Promise<TenantCard> {
  const schema = tenantSchemaName(tenantId);
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if ('customerId' in updates) { sets.push(`customer_id = $${i++}`); vals.push(updates.customerId ?? null); }
  if ('label'      in updates) { sets.push(`label = $${i++}`);       vals.push(updates.label      ?? null); }
  if (sets.length === 0) throw new Error('No fields to update');
  vals.push(myCardId);
  const rows = await queryTenantSchema<TenantCard>(
    tenantId,
    `UPDATE "${schema}".my_cards SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals,
  );
  if (!rows.length) throw new Error('Card record not found');
  // Mirror customer assignment into system.cards.assigned_to so the MQTT access
  // check (which reads system.cards) sees the same customer the tenant just set.
  if ('customerId' in updates) {
    await AppDataSource.query(
      `UPDATE system.cards SET assigned_to = $1 WHERE id = $2`,
      [updates.customerId ?? null, rows[0].card_id],
    );
  }
  return rows[0];
}

export async function getTenantSubscriptions(tenantId: string): Promise<TenantSubscription[]> {
  const schema = tenantSchemaName(tenantId);
  return queryTenantSchema<TenantSubscription>(
    tenantId,
    `SELECT s.*, p.name AS plan_name, p.price AS plan_price
     FROM "${schema}".subscriptions s
     INNER JOIN system.plans p ON p.id = s.plan_id
     ORDER BY s.created_at DESC`,
  );
}

export async function getTenantInvoices(tenantId: string): Promise<TenantInvoice[]> {
  const schema = tenantSchemaName(tenantId);
  return queryTenantSchema<TenantInvoice>(
    tenantId,
    `SELECT * FROM "${schema}".invoices ORDER BY created_at DESC`,
  );
}

// ── Tier 1 write: subscriptions ──────────────────────────────────────────────

export async function createTenantSubscription(
  tenantId: string,
  planId: string,
  billingCycle: 'monthly' | 'annual' | 'one_time',
  expiresAt: Date | null,
  startsAt?: Date,
): Promise<TenantSubscription> {
  const schema = tenantSchemaName(tenantId);
  const rows = await queryTenantSchema<TenantSubscription>(
    tenantId,
    `INSERT INTO "${schema}".subscriptions (plan_id, billing_cycle, expires_at, starts_at)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [planId, billingCycle, expiresAt ?? null, startsAt ?? new Date()],
  );
  return rows[0]!;
}

export async function updateTenantSubscription(
  tenantId: string,
  subId: string,
  data: { status?: string; expiresAt?: Date | null; notes?: string | null },
): Promise<TenantSubscription> {
  const schema = tenantSchemaName(tenantId);
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (data.status    !== undefined) { sets.push(`status = $${i++}`);     params.push(data.status); }
  if (data.expiresAt !== undefined) { sets.push(`expires_at = $${i++}`); params.push(data.expiresAt); }
  if (data.notes     !== undefined) { sets.push(`notes = $${i++}`);      params.push(data.notes); }
  if (sets.length === 0) throw new Error('No fields to update');
  params.push(subId);
  const rows = await queryTenantSchema<TenantSubscription>(
    tenantId,
    `UPDATE "${schema}".subscriptions SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    params,
  );
  return rows[0]!;
}

// ── Tier 1 write: invoices ───────────────────────────────────────────────────

export async function createTenantInvoice(
  tenantId: string,
  data: { amount: number; subscriptionId?: string | null; description?: string | null; dueDate?: Date | null },
): Promise<TenantInvoice> {
  const schema = tenantSchemaName(tenantId);
  const rows = await queryTenantSchema<TenantInvoice>(
    tenantId,
    `INSERT INTO "${schema}".invoices (amount, subscription_id, description, due_date)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [data.amount, data.subscriptionId ?? null, data.description ?? null, data.dueDate ?? null],
  );
  return rows[0]!;
}

export async function updateTenantInvoice(
  tenantId: string,
  invId: string,
  data: { status?: string; paidAt?: Date | null },
): Promise<TenantInvoice> {
  const schema = tenantSchemaName(tenantId);
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (data.status !== undefined) { sets.push(`status = $${i++}`);  params.push(data.status); }
  if (data.paidAt !== undefined) { sets.push(`paid_at = $${i++}`); params.push(data.paidAt); }
  if (sets.length === 0) throw new Error('No fields to update');
  params.push(invId);
  const rows = await queryTenantSchema<TenantInvoice>(
    tenantId,
    `UPDATE "${schema}".invoices SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    params,
  );
  return rows[0]!;
}

// ── Tier 2: membership plans ─────────────────────────────────────────────────

export async function getTenantMembershipPlans(tenantId: string): Promise<MembershipPlan[]> {
  const schema = tenantSchemaName(tenantId);
  return queryTenantSchema<MembershipPlan>(
    tenantId,
    `SELECT * FROM "${schema}".membership_plans ORDER BY created_at DESC`,
  );
}

export async function createTenantMembershipPlan(
  tenantId: string,
  data: { name: string; price: number; billingCycle: string; features: Record<string, unknown>; gstRate?: number | null },
): Promise<MembershipPlan> {
  const schema = tenantSchemaName(tenantId);
  const rows = await queryTenantSchema<MembershipPlan>(
    tenantId,
    `INSERT INTO "${schema}".membership_plans (name, price, billing_cycle, features, gst_rate)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [data.name, data.price, data.billingCycle, JSON.stringify(data.features), data.gstRate ?? null],
  );
  return rows[0]!;
}

export async function updateTenantMembershipPlan(
  tenantId: string,
  planId: string,
  data: { name?: string; price?: number; billingCycle?: string; features?: Record<string, unknown>; isActive?: boolean; gstRate?: number | null },
): Promise<MembershipPlan> {
  const schema = tenantSchemaName(tenantId);
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (data.name         !== undefined) { sets.push(`name = $${i++}`);          params.push(data.name); }
  if (data.price        !== undefined) { sets.push(`price = $${i++}`);         params.push(data.price); }
  if (data.billingCycle !== undefined) { sets.push(`billing_cycle = $${i++}`); params.push(data.billingCycle); }
  if (data.features     !== undefined) { sets.push(`features = $${i++}`);      params.push(JSON.stringify(data.features)); }
  if (data.isActive     !== undefined) { sets.push(`is_active = $${i++}`);     params.push(data.isActive); }
  if ('gstRate' in data)               { sets.push(`gst_rate = $${i++}`);      params.push(data.gstRate ?? null); }
  if (sets.length === 0) throw new Error('No fields to update');
  params.push(planId);
  const rows = await queryTenantSchema<MembershipPlan>(
    tenantId,
    `UPDATE "${schema}".membership_plans SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    params,
  );
  return rows[0]!;
}

export async function deleteTenantMembershipPlan(tenantId: string, planId: string): Promise<void> {
  const schema = tenantSchemaName(tenantId);
  await queryTenantSchema(tenantId, `DELETE FROM "${schema}".membership_plans WHERE id = $1`, [planId]);
}

// ── GST helpers ─────────────────────────────────────────────────────────────

/**
 * Resolve the effective GST rate for an invoice:
 * 1. Plan-level gst_rate (if planId given and plan has one)
 * 2. Tenant-level gst_rate (if tenant has gst_enabled = true)
 * 3. null if tenant has GST disabled
 */
export async function resolveGstRate(tenantId: string, planId?: string | null): Promise<number | null> {
  const [tenant] = await AppDataSource.query(
    `SELECT gst_enabled, gst_rate FROM system.tenants WHERE id = $1`,
    [tenantId],
  ) as { gst_enabled: boolean; gst_rate: string }[];
  if (!tenant?.gst_enabled) return null;

  if (planId) {
    const schema = tenantSchemaName(tenantId);
    const [plan] = await AppDataSource.query(
      `SELECT gst_rate FROM "${schema}".membership_plans WHERE id = $1`,
      [planId],
    ) as { gst_rate: string | null }[];
    if (plan?.gst_rate != null) return Number(plan.gst_rate);
  }
  return Number(tenant.gst_rate);
}

// ── Tier 2: customer subscriptions ──────────────────────────────────────────

export async function getCustomerSubscriptions(
  tenantId: string,
  customerId?: string,
): Promise<CustomerSubscription[]> {
  const schema = tenantSchemaName(tenantId);
  const where  = customerId ? `WHERE cs.customer_id = $1` : '';
  const params = customerId ? [customerId] : [];
  return queryTenantSchema<CustomerSubscription>(
    tenantId,
    `SELECT cs.id, cs.code, cs.customer_id, cs.plan_id, cs.status,
            cs.starts_at, cs.expires_at, cs.next_billing_date, cs.cancelled_at, cs.created_at,
            u.email AS customer_email, mp.name AS plan_name, mp.price AS plan_price
     FROM "${schema}".customer_subscriptions cs
     INNER JOIN system.users u ON u.id = cs.customer_id
     INNER JOIN "${schema}".membership_plans mp ON mp.id = cs.plan_id
     ${where} ORDER BY cs.created_at DESC`,
    params,
  );
}

// Helper: calculate next billing date from a given date + cycle
function calcNextBillingDate(billingCycle: string, fromDate: Date): Date | null {
  const d = new Date(fromDate);
  switch (billingCycle) {
    case 'daily':     d.setDate(d.getDate() + 1);         break;
    case 'monthly':   d.setMonth(d.getMonth() + 1);       break;
    case 'quarterly': d.setMonth(d.getMonth() + 3);       break;
    case 'half_year': d.setMonth(d.getMonth() + 6);       break;
    case 'annual':    d.setFullYear(d.getFullYear() + 1); break;
    default:          return null; // one_time, custom — no recurrence
  }
  return d;
}

export async function createCustomerSubscription(
  tenantId: string,
  data: { customerId: string; planId: string; expiresAt?: Date | null; startsAt?: Date },
): Promise<CustomerSubscription> {
  const schema = tenantSchemaName(tenantId);
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  try {
    await queryRunner.query(`SET search_path TO "${schema}", system, public`);
    await queryRunner.startTransaction();

    // One-active guard — only block if there's already an 'active' subscription
    const activeRows = await queryRunner.query(
      `SELECT id FROM "${schema}".customer_subscriptions WHERE customer_id = $1 AND status = 'active' LIMIT 1`,
      [data.customerId],
    ) as { id: string }[];
    if (activeRows.length > 0) {
      throw Object.assign(new Error('Customer already has an active subscription'), { statusCode: 409 });
    }

    // Fetch plan for auto-invoice amount + billing cycle
    const planRows = await queryRunner.query(
      `SELECT * FROM "${schema}".membership_plans WHERE id = $1`,
      [data.planId],
    ) as MembershipPlan[];
    if (!planRows[0]) throw new Error('Membership plan not found');
    const plan = planRows[0];

    const startsAt = data.startsAt ?? new Date();
    const nextBillingDate = calcNextBillingDate(plan.billing_cycle, startsAt);

    const subRows = await queryRunner.query(
      `INSERT INTO "${schema}".customer_subscriptions
         (customer_id, plan_id, expires_at, starts_at, next_billing_date, code)
       VALUES ($1, $2, $3, $4, $5, 'SUB-' || LPAD(nextval('"${schema}".subscription_code_seq')::text, 4, '0'))
       RETURNING *`,
      [data.customerId, data.planId, data.expiresAt ?? null, startsAt, nextBillingDate],
    ) as CustomerSubscription[];
    const sub = subRows[0]!;

    // Auto-generate first invoice (due = next_billing_date for recurring, expires_at for one-time)
    const invoiceDue = nextBillingDate ?? data.expiresAt ?? null;
    const gstRate   = await resolveGstRate(tenantId, data.planId);
    const gstAmount = gstRate != null ? Math.round(plan.price * gstRate) / 100 : null;
    await queryRunner.query(
      `INSERT INTO "${schema}".customer_invoices (customer_id, subscription_id, amount, gst_rate, gst_amount, description, due_date, code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'INV-' || LPAD(nextval('"${schema}".invoice_code_seq')::text, 4, '0'))`,
      [data.customerId, sub.id, plan.price, gstRate, gstAmount, `Membership: ${plan.name}`, invoiceDue],
    );

    await queryRunner.commitTransaction();
    return sub;
  } catch (err) {
    await queryRunner.rollbackTransaction();
    throw err;
  } finally {
    await queryRunner.release();
  }
}

export async function terminateCustomerSubscription(
  tenantId: string,
  subId: string,
): Promise<CustomerSubscription> {
  const schema = tenantSchemaName(tenantId);
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  try {
    await queryRunner.startTransaction();

    // Void all unpaid invoices for this subscription
    await queryRunner.query(
      `UPDATE "${schema}".customer_invoices SET status = 'void' WHERE subscription_id = $1 AND status = 'unpaid'`,
      [subId],
    );

    const rows = await queryRunner.query(
      `UPDATE "${schema}".customer_subscriptions
       SET status = 'terminated', next_billing_date = NULL
       WHERE id = $1 RETURNING *`,
      [subId],
    ) as CustomerSubscription[];
    if (!rows[0]) throw new Error('Subscription not found');

    await queryRunner.commitTransaction();
    return rows[0];
  } catch (err) {
    await queryRunner.rollbackTransaction();
    throw err;
  } finally {
    await queryRunner.release();
  }
}

export async function cancelCustomerSubscription(
  tenantId: string,
  subId: string,
): Promise<CustomerSubscription> {
  const schema = tenantSchemaName(tenantId);
  const rows = await queryTenantSchema<CustomerSubscription>(
    tenantId,
    `UPDATE "${schema}".customer_subscriptions
     SET status = 'cancelled', cancelled_at = NOW()
     WHERE id = $1 AND status = 'active' RETURNING *`,
    [subId],
  );
  if (!rows[0]) throw new Error('Active subscription not found');
  return rows[0];
}

export async function changeSubscriptionPlan(
  tenantId: string,
  subId: string,
  newPlanId: string,
): Promise<CustomerSubscription> {
  const schema = tenantSchemaName(tenantId);
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  try {
    await queryRunner.startTransaction();

    // Verify subscription is active
    const subRows = await queryRunner.query(
      `SELECT * FROM "${schema}".customer_subscriptions WHERE id = $1`,
      [subId],
    ) as CustomerSubscription[];
    if (!subRows[0]) throw new Error('Subscription not found');
    if (subRows[0].status !== 'active') throw new Error('Only active subscriptions can have their plan changed');
    const sub = subRows[0];

    // Fetch new plan
    const planRows = await queryRunner.query(
      `SELECT * FROM "${schema}".membership_plans WHERE id = $1`,
      [newPlanId],
    ) as MembershipPlan[];
    if (!planRows[0]) throw new Error('Membership plan not found');
    const newPlan = planRows[0];

    const now = new Date();
    const nextBillingDate = calcNextBillingDate(newPlan.billing_cycle, now);

    // Update subscription with new plan + recalculated billing date
    const updatedRows = await queryRunner.query(
      `UPDATE "${schema}".customer_subscriptions
       SET plan_id = $1, next_billing_date = $2
       WHERE id = $3 RETURNING *`,
      [newPlanId, nextBillingDate, subId],
    ) as CustomerSubscription[];

    // Generate immediate invoice for new plan (with GST)
    const gstRate   = await resolveGstRate(tenantId, newPlanId);
    const gstAmount = gstRate != null ? Math.round(newPlan.price * gstRate) / 100 : null;
    await queryRunner.query(
      `INSERT INTO "${schema}".customer_invoices (customer_id, subscription_id, amount, gst_rate, gst_amount, description, due_date, code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'INV-' || LPAD(nextval('"${schema}".invoice_code_seq')::text, 4, '0'))`,
      [sub.customer_id, subId, newPlan.price, gstRate, gstAmount, `Plan change: ${newPlan.name}`, nextBillingDate],
    );

    await queryRunner.commitTransaction();
    return updatedRows[0]!;
  } catch (err) {
    await queryRunner.rollbackTransaction();
    throw err;
  } finally {
    await queryRunner.release();
  }
}

export async function updateCustomerSubscription(
  tenantId: string,
  subId: string,
  data: { status?: string; expiresAt?: Date | null },
): Promise<CustomerSubscription> {
  const schema = tenantSchemaName(tenantId);
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (data.status    !== undefined) { sets.push(`status = $${i++}`);     params.push(data.status); }
  if (data.expiresAt !== undefined) { sets.push(`expires_at = $${i++}`); params.push(data.expiresAt); }
  if (sets.length === 0) throw new Error('No fields to update');
  params.push(subId);
  const rows = await queryTenantSchema<CustomerSubscription>(
    tenantId,
    `UPDATE "${schema}".customer_subscriptions SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    params,
  );
  return rows[0]!;
}

// ── Tier 2: customer invoices ────────────────────────────────────────────────

export async function getCustomerInvoices(
  tenantId: string,
  customerId?: string,
): Promise<CustomerInvoice[]> {
  const schema = tenantSchemaName(tenantId);
  const where  = customerId ? `WHERE ci.customer_id = $1` : '';
  const params = customerId ? [customerId] : [];
  return queryTenantSchema<CustomerInvoice>(
    tenantId,
    `SELECT ci.*, u.email AS customer_email
     FROM "${schema}".customer_invoices ci
     INNER JOIN system.users u ON u.id = ci.customer_id
     ${where} ORDER BY ci.created_at DESC`,
    params,
  );
}

export async function createCustomerInvoice(
  tenantId: string,
  data: {
    customerId: string;
    subscriptionId?: string | null;
    amount: number;
    description?: string | null;
    notes?: string | null;
    dueDate?: Date | null;
  },
): Promise<CustomerInvoice> {
  const schema = tenantSchemaName(tenantId);
  const gstRate   = await resolveGstRate(tenantId, data.subscriptionId ?? null);
  const gstAmount = gstRate != null ? Math.round(data.amount * gstRate) / 100 : null;
  const rows = await queryTenantSchema<CustomerInvoice>(
    tenantId,
    `INSERT INTO "${schema}".customer_invoices (customer_id, subscription_id, amount, gst_rate, gst_amount, description, notes, due_date, code)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'INV-' || LPAD(nextval('"${schema}".invoice_code_seq')::text, 4, '0')) RETURNING *`,
    [data.customerId, data.subscriptionId ?? null, data.amount, gstRate, gstAmount, data.description ?? null, data.notes ?? null, data.dueDate ?? null],
  );
  return rows[0]!;
}

export async function getCustomerInvoiceById(
  tenantId: string,
  invId: string,
): Promise<CustomerInvoice & {
  customer_name: string | null;
  tenant_gst_enabled: boolean;
  tenant_gstin: string | null;
  tenant_gst_legal_name: string | null;
  tenant_gst_pan: string | null;
  tenant_gst_rate: number;
  tenant_gst_address: string | null;
  tenant_gst_state: string | null;
  tenant_gst_state_code: string | null;
  tenant_name: string;
} | null> {
  const schema = tenantSchemaName(tenantId);
  const rows = await queryTenantSchema<CustomerInvoice & Record<string, unknown>>(
    tenantId,
    `SELECT ci.*,
            mc.name AS customer_name,
            u.email AS customer_email,
            t.name AS tenant_name,
            t.gst_enabled AS tenant_gst_enabled,
            t.gst_type AS tenant_gst_type,
            t.gstin AS tenant_gstin,
            t.gst_legal_name AS tenant_gst_legal_name,
            t.gst_pan AS tenant_gst_pan,
            t.gst_rate AS tenant_gst_rate,
            t.gst_address AS tenant_gst_address,
            t.gst_state AS tenant_gst_state,
            t.gst_state_code AS tenant_gst_state_code
     FROM "${schema}".customer_invoices ci
     INNER JOIN system.users u ON u.id = ci.customer_id
     LEFT JOIN "${schema}".my_customers mc ON mc.user_id = ci.customer_id
     INNER JOIN system.tenants t ON t.id = $2
     WHERE ci.id = $1`,
    [invId, tenantId],
  );
  return (rows[0] ?? null) as unknown as ReturnType<typeof getCustomerInvoiceById> extends Promise<infer R> ? R : never;
}

export async function updateCustomerInvoice(
  tenantId: string,
  invId: string,
  data: { status?: string; paidAt?: Date | null },
): Promise<CustomerInvoice> {
  const schema = tenantSchemaName(tenantId);
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (data.status !== undefined) { sets.push(`status = $${i++}`);  params.push(data.status); }
  if (data.paidAt !== undefined) { sets.push(`paid_at = $${i++}`); params.push(data.paidAt); }
  if (sets.length === 0) throw new Error('No fields to update');
  params.push(invId);
  const rows = await queryTenantSchema<CustomerInvoice>(
    tenantId,
    `UPDATE "${schema}".customer_invoices SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    params,
  );
  return rows[0]!;
}

export async function assignDeviceToTenant(
  tenantId: string,
  deviceId: string,
  label?: string,
): Promise<void> {
  const schema = tenantSchemaName(tenantId);
  await queryTenantSchema(
    tenantId,
    `INSERT INTO "${schema}".my_devices (device_id, label) VALUES ($1, $2)
     ON CONFLICT (device_id) DO UPDATE SET label = EXCLUDED.label`,
    [deviceId, label ?? null],
  );
}

export interface TenantDeviceRow {
  id: string;
  device_id: string;
  label: string | null;
  notes: string | null;
  assigned_at: Date;
  mac_address?: string;
  system_name?: string | null;
  status?: string;
  last_seen?: Date | null;
}

export async function updateTenantDevice(
  tenantId: string,
  myDeviceId: string,
  updates: { label?: string | null; notes?: string | null },
): Promise<TenantDeviceRow> {
  const schema = tenantSchemaName(tenantId);
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if ('label' in updates) { sets.push(`label = $${i++}`); vals.push(updates.label ?? null); }
  if ('notes' in updates) { sets.push(`notes = $${i++}`); vals.push(updates.notes ?? null); }
  if (sets.length === 0) throw new Error('No fields to update');
  vals.push(myDeviceId);
  const rows = await queryTenantSchema<TenantDeviceRow>(
    tenantId,
    `UPDATE "${schema}".my_devices SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals,
  );
  if (!rows.length) throw new Error('Device record not found');
  return rows[0];
}

export interface CardAccessDevice {
  id: string;          // my_devices.id
  device_id: string;
  label: string | null;
  mac_address: string;
  system_name: string | null;
  status: string;
  has_access: boolean;
}

export async function getCardAccessDevices(
  tenantId: string,
  myCardId: string,
): Promise<CardAccessDevice[]> {
  const schema = tenantSchemaName(tenantId);
  return queryTenantSchema<CardAccessDevice>(
    tenantId,
    `SELECT md.id, md.device_id, md.label, d.mac_address, d.name AS system_name, d.status,
            EXISTS (
              SELECT 1 FROM "${schema}".card_access_rules car
              WHERE car.my_card_id = $1 AND car.my_device_id = md.id
            ) AS has_access
     FROM "${schema}".my_devices md
     INNER JOIN system.devices d ON d.id = md.device_id
     ORDER BY md.label, d.name`,
    [myCardId],
  );
}

export async function setCardAccessDevices(
  tenantId: string,
  myCardId: string,
  myDeviceIds: string[],
): Promise<void> {
  const schema = tenantSchemaName(tenantId);
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  try {
    await queryRunner.startTransaction();
    await queryRunner.query(
      `SET search_path TO "${schema}", system, public`,
    );
    await queryRunner.query(
      `DELETE FROM "${schema}".card_access_rules WHERE my_card_id = $1`,
      [myCardId],
    );
    if (myDeviceIds.length > 0) {
      const placeholders = myDeviceIds.map((_, i) => `($1, $${i + 2})`).join(', ');
      await queryRunner.query(
        `INSERT INTO "${schema}".card_access_rules (my_card_id, my_device_id) VALUES ${placeholders}`,
        [myCardId, ...myDeviceIds],
      );
    }
    await queryRunner.commitTransaction();
  } catch (err) {
    await queryRunner.rollbackTransaction();
    throw err;
  } finally {
    await queryRunner.release();
  }
}

export async function assignCardToTenant(
  tenantId: string,
  cardId: string,
  customerId?: string,
  label?: string,
): Promise<void> {
  const schema = tenantSchemaName(tenantId);
  await queryTenantSchema(
    tenantId,
    `INSERT INTO "${schema}".my_cards (card_id, customer_id, label) VALUES ($1, $2, $3)
     ON CONFLICT (card_id) DO UPDATE
       SET customer_id = EXCLUDED.customer_id,
           label = EXCLUDED.label`,
    [cardId, customerId ?? null, label ?? null],
  );
}

// ── Tenant-scoped customers ───────────────────────────────────────────────────

export interface TenantCustomer {
  id: string;        // my_customers.id
  code: string;      // MEM-0001
  user_id: string;
  name: string | null;
  phone: string | null;
  joined_at: Date;
  // joined from system.users
  email: string;
  created_at: Date;
}

export async function getTenantCustomers(tenantId: string): Promise<TenantCustomer[]> {
  const schema = tenantSchemaName(tenantId);
  return queryTenantSchema<TenantCustomer>(
    tenantId,
    `SELECT mc.id, mc.user_id, mc.name, mc.phone, mc.joined_at, u.email, u.created_at
     FROM "${schema}".my_customers mc
     INNER JOIN system.users u ON u.id = mc.user_id
     ORDER BY mc.joined_at DESC`,
  );
}

export async function addCustomerToTenant(
  tenantId: string,
  userId: string,
  profile?: { name?: string | null; phone?: string | null },
): Promise<void> {
  const schema = tenantSchemaName(tenantId);
  await queryTenantSchema(
    tenantId,
    `INSERT INTO "${schema}".my_customers (user_id, name, phone, code)
     VALUES ($1, $2, $3, 'MEM-' || LPAD(nextval('"${schema}".member_code_seq')::text, 4, '0'))
     ON CONFLICT (user_id) DO UPDATE
       SET name  = COALESCE(EXCLUDED.name,  my_customers.name),
           phone = COALESCE(EXCLUDED.phone, my_customers.phone)`,
    [userId, profile?.name ?? null, profile?.phone ?? null],
  );
}

export async function removeCustomerFromTenant(tenantId: string, userId: string): Promise<void> {
  const schema = tenantSchemaName(tenantId);
  await queryTenantSchema(
    tenantId,
    `DELETE FROM "${schema}".my_customers WHERE user_id = $1`,
    [userId],
  );
}

export async function tenantHasActiveSubscription(tenantId: string): Promise<boolean> {
  const schema = tenantSchemaName(tenantId);
  const rows = await queryTenantSchema<{ count: string }>(
    tenantId,
    `SELECT COUNT(*)::text AS count FROM "${schema}".subscriptions
     WHERE status = 'active' AND (expires_at IS NULL OR expires_at > NOW())`,
  );
  return parseInt(rows[0]?.count ?? '0', 10) > 0;
}
