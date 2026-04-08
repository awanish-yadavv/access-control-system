'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { apiGet, apiPatch } from '@/lib/api';
import cn from '@/lib/cn';
import toast from 'react-hot-toast';
import DateTime from '@/components/ui/DateTime';

// ── Interfaces ────────────────────────────────────────────────────────────────

interface Subscription {
  id: string;
  plan_id: string;
  plan_name: string;
  plan_price: number;
  billing_cycle: string;
  status: 'active' | 'expired' | 'cancelled';
  starts_at: string;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
}

interface TenantInvoice {
  id: string;
  subscription_id: string | null;
  amount: number;
  description: string | null;
  status: 'unpaid' | 'paid' | 'void';
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
}

// ── Badge maps ────────────────────────────────────────────────────────────────

const SUB_BADGE: Record<string, string> = {
  active:    'bg-accent/15 text-accent border-accent/25',
  expired:   'bg-destructive/12 text-destructive border-destructive/25',
  cancelled: 'bg-muted text-muted-foreground border-border',
};

const INV_BADGE: Record<string, string> = {
  paid:   'bg-accent/15 text-accent border-accent/25',
  unpaid: 'bg-destructive/12 text-destructive border-destructive/25',
  void:   'bg-muted text-muted-foreground border-border',
};

// ── Tab 1: My Plan ────────────────────────────────────────────────────────────

const MyPlanTab = ({ tenantId }: { tenantId: string }) => {
  const [subs, setSubs]       = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<Subscription[]>(`/tenants/${tenantId}/subscriptions`);
      setSubs(Array.isArray(res.data) ? res.data : []);
    } catch { toast.error('Failed to load subscriptions'); }
    finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const activeSub = subs.find(s => s.status === 'active');

  const cancel = async (subId: string) => {
    try {
      await apiPatch(`/tenants/${tenantId}/subscriptions/${subId}`, { status: 'cancelled' });
      toast.success('Subscription cancelled');
      load();
    } catch { toast.error('Failed to cancel'); }
  };

  if (loading) return <div className="p-10 text-center font-mono text-[11px] text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      {activeSub ? (
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground mb-1">Current Plan</div>
              <div className="text-2xl font-bold text-foreground">{activeSub.plan_name}</div>
              <div className="font-mono text-lg text-primary mt-1">
                ${Number(activeSub.plan_price).toFixed(2)}
                <span className="text-[10px] text-muted-foreground">/{activeSub.billing_cycle}</span>
              </div>
            </div>
            <span className={cn('font-mono text-[9px] tracking-[0.1em] uppercase px-2.5 py-1 rounded-[4px] border', SUB_BADGE[activeSub.status])}>
              {activeSub.status}
            </span>
          </div>
          <div className="mt-5 pt-5 border-t border-border grid grid-cols-3 gap-4">
            <div>
              <div className="text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1">Started</div>
              <DateTime value={activeSub.starts_at} format="date" className="font-mono text-[11px] text-foreground" />
            </div>
            <div>
              <div className="text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1">Expires</div>
              <DateTime value={activeSub.expires_at} format="date" fallback="No expiry" className="font-mono text-[11px] text-foreground" />
            </div>
            <div>
              <div className="text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1">Billing Cycle</div>
              <div className="font-mono text-[11px] text-foreground capitalize">{activeSub.billing_cycle.replace('_', ' ')}</div>
            </div>
          </div>
          {activeSub.notes && (
            <div className="mt-4 px-3 py-2.5 bg-secondary rounded-md font-mono text-[11px] text-muted-foreground">{activeSub.notes}</div>
          )}
          <div className="mt-5">
            <button
              onClick={() => cancel(activeSub.id)}
              className="px-4 py-2 bg-destructive/10 border border-destructive/30 text-destructive font-mono text-[11px] tracking-[0.06em] uppercase rounded-md hover:bg-destructive/20 transition-colors"
            >
              Cancel Plan
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <div className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground mb-2">No Active Plan</div>
          <div className="text-[13px] text-muted-foreground">Contact NeyoFit to subscribe to a platform plan.</div>
        </div>
      )}

      {subs.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <span className="text-[11px] font-mono tracking-[0.1em] uppercase text-foreground">Subscription History</span>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border">
                {['Plan', 'Price', 'Cycle', 'Status', 'Expires', 'Started'].map(h => (
                  <th key={h} className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground px-5 py-2.5 text-left font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subs.map(s => (
                <tr key={s.id} className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors">
                  <td className="px-5 py-3 text-[13px] font-semibold text-foreground">{s.plan_name}</td>
                  <td className="px-5 py-3 font-mono text-sm text-primary">${Number(s.plan_price).toFixed(2)}</td>
                  <td className="px-5 py-3 font-mono text-[10px] text-muted-foreground capitalize">{s.billing_cycle.replace('_', ' ')}</td>
                  <td className="px-5 py-3">
                    <span className={cn('font-mono text-[9px] tracking-[0.1em] uppercase px-2 py-0.5 rounded-[3px] border', SUB_BADGE[s.status])}>{s.status}</span>
                  </td>
                  <td className="px-5 py-3"><DateTime value={s.expires_at} format="date" /></td>
                  <td className="px-5 py-3"><DateTime value={s.starts_at} format="date" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ── Tab 2: NeyoFit Invoices ───────────────────────────────────────────────────

const PlatformInvoicesTab = ({ tenantId }: { tenantId: string }) => {
  const [invoices, setInvoices] = useState<TenantInvoice[]>([]);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<TenantInvoice[]>(`/tenants/${tenantId}/invoices`);
      setInvoices(Array.isArray(res.data) ? res.data : []);
    } catch { toast.error('Failed to load invoices'); }
    finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const pay = async (invId: string) => {
    try {
      await apiPatch(`/tenants/${tenantId}/invoices/${invId}`, {
        status: 'paid',
        paidAt: new Date().toISOString(),
      });
      toast.success('Invoice marked as paid');
      load();
    } catch { toast.error('Failed to update invoice'); }
  };

  const voidInv = async (invId: string) => {
    try {
      await apiPatch(`/tenants/${tenantId}/invoices/${invId}`, { status: 'void' });
      toast.success('Invoice voided');
      load();
    } catch { toast.error('Failed to void invoice'); }
  };

  const unpaidTotal = invoices.filter(i => i.status === 'unpaid').reduce((s, i) => s + Number(i.amount), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground mb-2">Total Invoices</div>
          <div className="text-2xl font-bold text-foreground">{invoices.length}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground mb-2">Outstanding</div>
          <div className={cn('text-2xl font-mono font-bold', unpaidTotal > 0 ? 'text-destructive' : 'text-accent')}>
            ${unpaidTotal.toFixed(2)}
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground mb-2">Paid</div>
          <div className="text-2xl font-bold text-accent">{invoices.filter(i => i.status === 'paid').length}</div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              {['ID', 'Amount', 'Description', 'Status', 'Due', 'Paid At', 'Actions'].map(h => (
                <th key={h} className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground px-5 py-2.5 text-left font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="p-8 text-center font-mono text-[11px] text-muted-foreground">Loading…</td></tr>
            ) : invoices.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center font-mono text-[11px] text-muted-foreground">No invoices</td></tr>
            ) : invoices.map(inv => (
              <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors">
                <td className="px-5 py-3 font-mono text-[10px] text-muted-foreground">{inv.id.slice(0, 8)}…</td>
                <td className="px-5 py-3 font-mono text-sm font-semibold text-foreground">${Number(inv.amount).toFixed(2)}</td>
                <td className="px-5 py-3 text-[12px] text-muted-foreground max-w-[160px] truncate">{inv.description ?? '—'}</td>
                <td className="px-5 py-3">
                  <span className={cn('font-mono text-[9px] tracking-[0.1em] uppercase px-2 py-0.5 rounded-[3px] border', INV_BADGE[inv.status])}>
                    {inv.status}
                  </span>
                </td>
                <td className="px-5 py-3"><DateTime value={inv.due_date} format="date" /></td>
                <td className="px-5 py-3"><DateTime value={inv.paid_at} format="datetime" /></td>
                <td className="px-5 py-3">
                  {inv.status === 'unpaid' && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => pay(inv.id)}
                        className="font-mono text-[9px] tracking-[0.06em] uppercase px-2.5 py-1 bg-accent/10 border border-accent/30 text-accent rounded hover:bg-accent/20 transition-colors"
                      >
                        Pay
                      </button>
                      <button
                        onClick={() => voidInv(inv.id)}
                        className="font-mono text-[9px] tracking-[0.06em] uppercase px-2.5 py-1 bg-muted border border-border text-muted-foreground rounded hover:bg-secondary transition-colors"
                      >
                        Void
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'myplan' | 'invoices';

const TABS: { id: Tab; label: string }[] = [
  { id: 'myplan',   label: 'My Plan' },
  { id: 'invoices', label: 'NeyoFit Invoices' },
];

const TenantBillingPage = () => {
  const { tenant: tenantId } = useParams<{ tenant: string }>();
  const [tab, setTab] = useState<Tab>('myplan');

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-sm font-bold tracking-[0.04em] text-foreground uppercase">Billing</h1>
        <p className="font-mono text-[10px] text-muted-foreground tracking-[0.06em] mt-1">
          Your NeyoFit platform subscription &amp; invoices
        </p>
      </div>

      <div className="flex gap-1 mb-6 bg-secondary border border-border rounded-lg p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-1.5 font-mono text-[9px] tracking-[0.1em] uppercase rounded-md transition-colors whitespace-nowrap',
              tab === t.id ? 'bg-card border border-border text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'myplan'   && <MyPlanTab tenantId={tenantId} />}
      {tab === 'invoices' && <PlatformInvoicesTab tenantId={tenantId} />}
    </div>
  );
};

export default TenantBillingPage;
