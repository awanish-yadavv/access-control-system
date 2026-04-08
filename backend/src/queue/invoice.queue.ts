import { Queue } from 'bullmq';
import { redisConnection } from './connection';

export const invoiceQueue = new Queue('invoice-queue', { connection: redisConnection });

/**
 * Registers the single repeating job that drives all recurring invoice generation.
 * Idempotent — safe to call on every app startup.
 */
export async function startInvoiceScheduler(): Promise<void> {
  // Remove stale repeatable jobs from previous runs
  const existing = await invoiceQueue.getRepeatableJobs();
  for (const job of existing) {
    await invoiceQueue.removeRepeatableByKey(job.key);
  }

  const intervalMs = parseInt(process.env.INVOICE_INTERVAL_MS ?? String(60 * 60 * 1000)); // default: 1h

  await invoiceQueue.add(
    'process-due-invoices',
    {},
    {
      repeat:   { every: intervalMs },
      attempts: 3,
      backoff:  { type: 'exponential', delay: 5000 },
    },
  );

  console.log(`[Queue] Invoice scheduler started — interval: ${intervalMs}ms`);
}
