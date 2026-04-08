import { Worker, Job } from 'bullmq';
import { AppDataSource } from '../data-source';
import { redisConnection } from './connection';
import { tenantSchemaName } from '../service/tenant-schema.service';

// ── Billing cycle → next date ─────────────────────────────────────────────────

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

// ── Worker ────────────────────────────────────────────────────────────────────

interface DueSub {
  id: string;
  customer_id: string;
  next_billing_date: Date;
  price: number;
  plan_name: string;
  billing_cycle: string;
  plan_gst_rate: number | null;
}

const invoiceWorker = new Worker(
  'invoice-queue',
  async (_job: Job) => {
    if (!AppDataSource.isInitialized) {
      console.warn('[Worker] DB not ready — skipping run');
      return;
    }

    const now = new Date();
    console.log('[Worker] Processing due invoices at', now.toISOString());

    // Iterate all tenants — keeps per-tenant schema isolation
    const tenants = await AppDataSource.query(
      `SELECT id, gst_enabled, gst_rate FROM system.tenants`,
    ) as { id: string; gst_enabled: boolean; gst_rate: string }[];

    let invoicesCreated = 0;
    let subscriptionsExpired = 0;

    for (const tenant of tenants) {
      const schema = tenantSchemaName(tenant.id);
      const tenantGst = { enabled: tenant.gst_enabled, rate: Number(tenant.gst_rate) };
      try {
        await processTenant(schema, now, tenantGst, () => invoicesCreated++, () => subscriptionsExpired++);
      } catch (err) {
        console.error(`[Worker] Error on tenant ${tenant.id}:`, err);
        // Continue with remaining tenants
      }
    }

    console.log(
      `[Worker] Done — ${invoicesCreated} invoice(s) created, ${subscriptionsExpired} subscription(s) expired`,
    );
  },
  { connection: redisConnection },
);

async function processTenant(
  schema: string,
  now: Date,
  tenantGst: { enabled: boolean; rate: number },
  onInvoice: () => void,
  onExpired: () => void,
): Promise<void> {
  // ── 1. Active subscriptions due for next invoice ─────────────────────────
  const dueActive = await AppDataSource.query(`
    SELECT cs.id, cs.customer_id, cs.next_billing_date,
           mp.price, mp.name AS plan_name, mp.billing_cycle,
           mp.gst_rate AS plan_gst_rate
    FROM "${schema}".customer_subscriptions cs
    INNER JOIN "${schema}".membership_plans mp ON mp.id = cs.plan_id
    WHERE cs.status = 'active'
      AND cs.next_billing_date IS NOT NULL
      AND cs.next_billing_date <= $1
  `, [now]) as DueSub[];

  for (const sub of dueActive) {
    const nextDate = calcNextBillingDate(sub.billing_cycle, new Date(sub.next_billing_date));

    // Resolve GST: plan-level rate → tenant fallback (only if GST enabled)
    const effectiveGstRate = tenantGst.enabled
      ? (sub.plan_gst_rate != null ? Number(sub.plan_gst_rate) : tenantGst.rate)
      : null;
    const gstAmount = effectiveGstRate != null
      ? Math.round(sub.price * effectiveGstRate) / 100
      : null;

    // Generate invoice for this billing period
    await AppDataSource.query(`
      INSERT INTO "${schema}".customer_invoices
        (customer_id, subscription_id, amount, gst_rate, gst_amount, description, due_date, code)
      VALUES ($1, $2, $3, $4, $5, $6, $7,
        'INV-' || LPAD(nextval('"${schema}".invoice_code_seq')::text, 4, '0'))
    `, [
      sub.customer_id,
      sub.id,
      sub.price,
      effectiveGstRate,
      gstAmount,
      `Membership: ${sub.plan_name}`,
      nextDate ?? null,
    ]);
    onInvoice();

    if (!nextDate) {
      // one_time / custom — subscription has served its single cycle
      await AppDataSource.query(`
        UPDATE "${schema}".customer_subscriptions
        SET status = 'expired', next_billing_date = NULL
        WHERE id = $1
      `, [sub.id]);
      onExpired();
    } else {
      // Advance next_billing_date
      await AppDataSource.query(`
        UPDATE "${schema}".customer_subscriptions
        SET next_billing_date = $1
        WHERE id = $2
      `, [nextDate, sub.id]);
    }
  }

  // ── 2. Cancelled subscriptions whose cycle has ended — expire them ────────
  // No new invoice for cancelled subs — current cycle was already invoiced at creation/last run.
  const dueCancelled = await AppDataSource.query(`
    SELECT id FROM "${schema}".customer_subscriptions
    WHERE status = 'cancelled'
      AND next_billing_date IS NOT NULL
      AND next_billing_date <= $1
  `, [now]) as { id: string }[];

  for (const sub of dueCancelled) {
    await AppDataSource.query(`
      UPDATE "${schema}".customer_subscriptions
      SET status = 'expired', next_billing_date = NULL
      WHERE id = $1
    `, [sub.id]);
    onExpired();
  }
}

invoiceWorker.on('completed', (job) => console.log(`[Worker] Job ${job.id} completed`));
invoiceWorker.on('failed',    (job, err) => console.error(`[Worker] Job ${job?.id} failed:`, err.message));

export default invoiceWorker;
