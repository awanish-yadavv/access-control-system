'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { apiGet, apiPost, apiPatch } from '@/lib/api';
import cn from '@/lib/cn';
import toast from 'react-hot-toast';
import DateTime from '@/components/ui/DateTime';

// ── Interfaces ────────────────────────────────────────────────────────────────

interface TenantCustomer {
  user_id: string;
  email: string;
  name: string | null;
}

interface MembershipPlan {
  id: string;
  name: string;
  price: number;
  billing_cycle: 'daily' | 'monthly' | 'quarterly' | 'half_year' | 'annual' | 'one_time' | 'custom';
  is_active: boolean;
}

interface CustomerSubscription {
  id: string;
  code: string;
  customer_id: string;
  customer_email: string;
  plan_id: string;
  plan_name: string;
  plan_price: number;
  status: 'active' | 'expired' | 'cancelled' | 'terminated';
  starts_at: string;
  expires_at: string | null;
  next_billing_date: string | null;
  cancelled_at: string | null;
  created_at: string;
}

// ── Badge map ─────────────────────────────────────────────────────────────────

const SUB_BADGE: Record<string, string> = {
  active:     'bg-accent/15 text-accent border-accent/25',
  expired:    'bg-destructive/12 text-destructive border-destructive/25',
  cancelled:  'bg-amber-500/12 text-amber-600 border-amber-500/25',
  terminated: 'bg-muted text-muted-foreground border-border',
};

const CYCLE_LABELS: Record<string, string> = {
  daily: 'Daily', monthly: 'Monthly', quarterly: 'Quarterly',
  half_year: 'Half Year', annual: 'Annual', one_time: 'One-time', custom: 'Custom',
};

const calcExpiry = (cycle: string): string | null => {
  if (cycle === 'one_time' || cycle === 'custom') return null;
  const d = new Date();
  switch (cycle) {
    case 'daily':     d.setDate(d.getDate() + 1); break;
    case 'monthly':   d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'half_year': d.setMonth(d.getMonth() + 6); break;
    case 'annual':    d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toISOString();
};

// ── Shared components ─────────────────────────────────────────────────────────

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

interface SearchDropProps {
  label: string; value: string; display: string;
  options: { id: string; label: string; sub?: string }[];
  onSelect: (id: string) => void; onClear?: () => void;
}
const SearchDrop = ({ label, value, display, options, onSelect, onClear }: SearchDropProps) => {
  const [open, setOpen] = useState(false);
  const [q, setQ]       = useState('');
  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(q.toLowerCase()) ||
    (o.sub ?? '').toLowerCase().includes(q.toLowerCase())
  );
  return (
    <div className="relative">
      <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1.5">{label}</label>
      <button type="button" onClick={() => { setOpen(!open); setQ(''); }}
        className="w-full flex items-center justify-between bg-secondary border border-border rounded-md px-3 py-2 text-left">
        <span className={cn('text-[13px]', value ? 'text-foreground' : 'text-muted-foreground')}>
          {value ? display : `Select ${label.toLowerCase()}…`}
        </span>
        <div className="flex items-center gap-1.5">
          {value && onClear && (
            <span role="button" tabIndex={0} onClick={e => { e.stopPropagation(); onClear(); }}
              onKeyDown={e => e.key === 'Enter' && (e.stopPropagation(), onClear?.())}
              className="text-muted-foreground hover:text-foreground p-0.5"><CloseIcon /></span>
          )}
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className="text-muted-foreground">
            <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-card border border-border rounded-md shadow-lg overflow-hidden">
          <div className="p-2 border-b border-border">
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
              className="w-full bg-secondary rounded px-2.5 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground outline-none" />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0
              ? <div className="p-3 text-center font-mono text-[10px] text-muted-foreground">No results</div>
              : filtered.map(o => (
                <button key={o.id} type="button" onClick={() => { onSelect(o.id); setOpen(false); }}
                  className={cn('w-full flex items-center justify-between px-3 py-2 text-left hover:bg-secondary transition-colors', o.id === value && 'bg-accent/10')}>
                  <span className="text-[13px] text-foreground">{o.label}</span>
                  {o.sub && <span className="font-mono text-[10px] text-muted-foreground">{o.sub}</span>}
                </button>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
};

interface PanelProps { open: boolean; onClose: () => void; title: string; children: React.ReactNode; }
const Panel = ({ open, onClose, title, children }: PanelProps) => (
  <>
    {open && <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />}
    <div className={cn(
      'fixed top-0 right-0 h-full w-[440px] z-50 bg-background border-l border-border shadow-2xl transition-transform duration-300',
      open ? 'translate-x-0' : 'translate-x-full',
    )}>
      <div className="flex items-center justify-between px-6 py-5 border-b border-border">
        <h2 className="text-[11px] font-mono tracking-[0.14em] uppercase text-foreground">{title}</h2>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><CloseIcon /></button>
      </div>
      <div className="overflow-y-auto h-[calc(100%-61px)] px-6 py-5 space-y-4">{children}</div>
    </div>
  </>
);

// ── Page ──────────────────────────────────────────────────────────────────────

const TenantSubscriptionsPage = () => {
  const { tenant: tenantId } = useParams<{ tenant: string }>();

  const [subs, setSubs]           = useState<CustomerSubscription[]>([]);
  const [loading, setLoading]     = useState(true);
  const [plans, setPlans]         = useState<MembershipPlan[]>([]);
  const [customers, setCustomers] = useState<TenantCustomer[]>([]);

  // Create panel
  const [panelOpen, setPanelOpen]   = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [planId, setPlanId]         = useState('');
  const [expiresAt, setExpiresAt]   = useState('');
  const [saving, setSaving]         = useState(false);

  // Change plan panel
  const [changePlanOpen, setChangePlanOpen]     = useState(false);
  const [changePlanSubId, setChangePlanSubId]   = useState('');
  const [newPlanId, setNewPlanId]               = useState('');
  const [changingSaving, setChangingSaving]     = useState(false);

  // Auto-compute expiry when plan changes
  useEffect(() => {
    if (!planId) { setExpiresAt(''); return; }
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;
    setExpiresAt(plan.billing_cycle === 'custom' ? '' : (calcExpiry(plan.billing_cycle) ?? ''));
  }, [planId, plans]);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<CustomerSubscription[]>(`/tenants/${tenantId}/customer-subscriptions`);
      setSubs(Array.isArray(res.data) ? res.data : []);
    } catch { toast.error('Failed to load subscriptions'); }
    finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => {
    load();
    Promise.all([
      apiGet<MembershipPlan[]>(`/tenants/${tenantId}/membership-plans`),
      apiGet<TenantCustomer[]>(`/tenants/${tenantId}/customers`),
    ]).then(([plRes, cuRes]) => {
      setPlans((Array.isArray(plRes.data) ? plRes.data : []).filter(p => p.is_active));
      setCustomers(Array.isArray(cuRes.data) ? cuRes.data : []);
    }).catch(() => {});
  }, [tenantId, load]);

  const openCreate = () => { setCustomerId(''); setPlanId(''); setExpiresAt(''); setPanelOpen(true); };

  const create = async () => {
    if (!customerId || !planId) { toast.error('Customer and plan are required'); return; }
    setSaving(true);
    try {
      await apiPost(`/tenants/${tenantId}/customer-subscriptions`, {
        customerId, planId, expiresAt: expiresAt || null,
      });
      toast.success('Subscription created');
      setPanelOpen(false);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Failed to create subscription');
    }
    finally { setSaving(false); }
  };

  const terminate = async (subId: string) => {
    if (!confirm('Terminate this subscription? This will void all unpaid invoices and cannot be undone.')) return;
    try {
      await apiPost(`/tenants/${tenantId}/customer-subscriptions/${subId}/terminate`, {});
      toast.success('Subscription terminated');
      load();
    } catch { toast.error('Failed to terminate subscription'); }
  };

  const cancel = async (subId: string) => {
    try {
      await apiPost(`/tenants/${tenantId}/customer-subscriptions/${subId}/cancel`, {});
      toast.success('Subscription cancelled — current cycle will complete');
      load();
    } catch { toast.error('Failed to cancel subscription'); }
  };

  const openChangePlan = (subId: string) => {
    setChangePlanSubId(subId);
    setNewPlanId('');
    setChangePlanOpen(true);
  };

  const submitChangePlan = async () => {
    if (!newPlanId) { toast.error('Select a plan'); return; }
    setChangingSaving(true);
    try {
      await apiPatch(`/tenants/${tenantId}/customer-subscriptions/${changePlanSubId}/plan`, { planId: newPlanId });
      toast.success('Plan changed — new invoice generated');
      setChangePlanOpen(false);
      load();
    } catch { toast.error('Failed to change plan'); }
    finally { setChangingSaving(false); }
  };

  const selectedCustomer = customers.find(u => u.user_id === customerId);
  const selectedPlan     = plans.find(p => p.id === planId);
  const selectedNewPlan  = plans.find(p => p.id === newPlanId);

  const active     = subs.filter(s => s.status === 'active').length;
  const expired    = subs.filter(s => s.status === 'expired').length;
  const cancelled  = subs.filter(s => s.status === 'cancelled').length;
  const terminated = subs.filter(s => s.status === 'terminated').length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-sm font-bold tracking-[0.04em] text-foreground uppercase">Subscriptions</h1>
          <p className="font-mono text-[10px] text-muted-foreground tracking-[0.06em] mt-1">
            Member plan subscriptions &amp; lifecycle
          </p>
        </div>
        <button onClick={openCreate}
          className="bg-primary text-primary-foreground border-none rounded-md px-4 py-2 text-[13px] font-bold tracking-[0.06em] uppercase cursor-pointer hover:opacity-90 transition-opacity">
          + Subscribe Member
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground mb-2">Active</div>
          <div className="text-2xl font-bold text-accent">{active}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground mb-2">Cancelled</div>
          <div className="text-2xl font-bold text-amber-600">{cancelled}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground mb-2">Expired</div>
          <div className="text-2xl font-bold text-foreground">{expired}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground mb-2">Terminated</div>
          <div className="text-2xl font-bold text-muted-foreground">{terminated}</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              {['Sub ID', 'Customer', 'Plan', 'Price', 'Cycle', 'Status', 'Next Billing', 'Started', 'Created', 'Actions'].map(h => (
                <th key={h} className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground px-5 py-2.5 text-left font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="p-10 text-center font-mono text-[11px] text-muted-foreground">Loading…</td></tr>
            ) : subs.length === 0 ? (
              <tr><td colSpan={10} className="p-10 text-center font-mono text-[11px] text-muted-foreground">No subscriptions yet</td></tr>
            ) : subs.map(s => (
              <tr key={s.id} className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors">
                <td className="px-5 py-3 font-mono text-[10px] text-primary tracking-[0.06em]">{s.code}</td>
                <td className="px-5 py-3 text-[12px] text-foreground">{s.customer_email}</td>
                <td className="px-5 py-3 text-[12px] font-semibold text-foreground">{s.plan_name}</td>
                <td className="px-5 py-3 font-mono text-sm text-primary">${Number(s.plan_price).toFixed(2)}</td>
                <td className="px-5 py-3 font-mono text-[10px] text-muted-foreground">
                  {CYCLE_LABELS[plans.find(p => p.id === s.plan_id)?.billing_cycle ?? ''] ?? '—'}
                </td>
                <td className="px-5 py-3">
                  <span className={cn('font-mono text-[9px] tracking-[0.1em] uppercase px-2 py-0.5 rounded-[3px] border', SUB_BADGE[s.status])}>
                    {s.status}
                  </span>
                </td>
                <td className="px-5 py-3">
                  {s.next_billing_date
                    ? <DateTime value={s.next_billing_date} format="date" />
                    : s.cancelled_at
                      ? <span className="font-mono text-[10px] text-amber-600">Cancels <DateTime value={s.cancelled_at} format="date" className="text-amber-600 font-mono text-[10px]" /></span>
                      : <span className="font-mono text-[10px] text-muted-foreground">—</span>
                  }
                </td>
                <td className="px-5 py-3"><DateTime value={s.starts_at} format="date" /></td>
                <td className="px-5 py-3"><DateTime value={s.created_at} format="datetime" /></td>
                <td className="px-5 py-3">
                  {s.status === 'active' && (
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => openChangePlan(s.id)}
                        className="font-mono text-[9px] px-2 py-0.5 bg-accent/10 border border-accent/30 text-accent rounded hover:bg-accent/20 transition-colors">
                        Change Plan
                      </button>
                      <button onClick={() => cancel(s.id)}
                        className="font-mono text-[9px] px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-600 rounded hover:bg-amber-500/20 transition-colors">
                        Cancel
                      </button>
                      <button onClick={() => terminate(s.id)}
                        className="font-mono text-[9px] px-2 py-0.5 bg-destructive/10 border border-destructive/30 text-destructive rounded hover:bg-destructive/20 transition-colors">
                        Terminate
                      </button>
                    </div>
                  )}
                  {s.status === 'cancelled' && (
                    <span className="font-mono text-[9px] text-amber-600 tracking-[0.06em]">Finishing cycle…</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create subscription panel */}
      <Panel open={panelOpen} onClose={() => setPanelOpen(false)} title="Subscribe Member">
        <SearchDrop
          label="Customer"
          value={customerId}
          display={selectedCustomer ? (selectedCustomer.name ? `${selectedCustomer.name} (${selectedCustomer.email})` : selectedCustomer.email) : ''}
          options={customers.map(u => ({ id: u.user_id, label: u.name ? `${u.name} (${u.email})` : u.email }))}
          onSelect={setCustomerId}
          onClear={() => setCustomerId('')}
        />
        <SearchDrop
          label="Membership Plan"
          value={planId}
          display={selectedPlan ? `${selectedPlan.name} — $${Number(selectedPlan.price).toFixed(2)}` : ''}
          options={plans.map(p => ({ id: p.id, label: p.name, sub: `$${Number(p.price).toFixed(2)}` }))}
          onSelect={setPlanId}
          onClear={() => setPlanId('')}
        />
        {planId && (() => {
          const plan = plans.find(p => p.id === planId);
          if (!plan) return null;
          if (plan.billing_cycle === 'one_time') return (
            <div className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-md">
              <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-muted-foreground">Billing</span>
              <span className="font-mono text-[11px] text-foreground">One-time charge, no recurrence</span>
            </div>
          );
          if (plan.billing_cycle === 'custom') return (
            <div>
              <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1.5">Expiry Date</label>
              <input value={expiresAt} onChange={e => setExpiresAt(e.target.value)} type="datetime-local"
                className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-[13px] text-foreground outline-none focus:border-primary transition-colors" />
            </div>
          );
          return (
            <div className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-md">
              <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-muted-foreground">First billing</span>
              <span className="font-mono text-[11px] text-foreground">
                {expiresAt ? new Date(expiresAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
              </span>
              <span className="ml-auto font-mono text-[9px] text-muted-foreground uppercase tracking-[0.06em]">{CYCLE_LABELS[plan.billing_cycle]}</span>
            </div>
          );
        })()}
        <button onClick={create} disabled={saving}
          className="w-full mt-2 h-10 bg-primary text-primary-foreground font-mono text-[10px] tracking-[0.1em] uppercase rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50">
          {saving ? 'Creating…' : 'Create Subscription'}
        </button>
      </Panel>

      {/* Change plan panel */}
      <Panel open={changePlanOpen} onClose={() => setChangePlanOpen(false)} title="Change Membership Plan">
        <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
          Changing the plan will generate a new invoice immediately and recalculate the next billing date.
        </p>
        <SearchDrop
          label="New Membership Plan"
          value={newPlanId}
          display={selectedNewPlan ? `${selectedNewPlan.name} — $${Number(selectedNewPlan.price).toFixed(2)}` : ''}
          options={plans.map(p => ({ id: p.id, label: p.name, sub: `$${Number(p.price).toFixed(2)}` }))}
          onSelect={setNewPlanId}
          onClear={() => setNewPlanId('')}
        />
        <button onClick={submitChangePlan} disabled={changingSaving}
          className="w-full mt-2 h-10 bg-primary text-primary-foreground font-mono text-[10px] tracking-[0.1em] uppercase rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50">
          {changingSaving ? 'Changing…' : 'Change Plan'}
        </button>
      </Panel>
    </div>
  );
};

export default TenantSubscriptionsPage;
