'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';
import cn from '@/lib/cn';
import toast from 'react-hot-toast';
import DateTime from '@/components/ui/DateTime';

// ── Interfaces ─────────────────────────────────────────────────────────────────

interface Customer {
  id: string;
  code: string;
  user_id: string;
  email: string;
  name: string | null;
  phone: string | null;
  joined_at: string;
  created_at: string;
}

interface MembershipPlan {
  id: string;
  name: string;
  price: number;
  billing_cycle: 'daily' | 'monthly' | 'quarterly' | 'half_year' | 'annual' | 'one_time' | 'custom';
  is_active: boolean;
}

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

interface TenantCard {
  id: string;
  uid: string;
  label: string | null;
  customer_id: string | null;
}

// ── Shared atoms ───────────────────────────────────────────────────────────────

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
            <span role="button" tabIndex={0}
              onClick={e => { e.stopPropagation(); onClear(); }}
              onKeyDown={e => e.key === 'Enter' && (e.stopPropagation(), onClear?.())}
              className="text-muted-foreground hover:text-foreground p-0.5">
              <CloseIcon />
            </span>
          )}
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className="text-muted-foreground">
            <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-card border border-border rounded-md shadow-lg overflow-hidden">
          <div className="p-2 border-b border-border">
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
              className="w-full bg-secondary rounded px-2.5 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground outline-none" />
          </div>
          <div className="max-h-44 overflow-y-auto">
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

// ── Multi-step modal ───────────────────────────────────────────────────────────

const STEPS = [
  { n: 1, label: 'Customer' },
  { n: 2, label: 'Plan' },
  { n: 3, label: 'Card' },
];

interface AddCustomerModalProps {
  tenantId: string;
  onClose: () => void;
  onDone: () => void;
}

const AddCustomerModal = ({ tenantId, onClose, onDone }: AddCustomerModalProps) => {
  const [step, setStep] = useState(1);

  // Step 1
  const [name, setName]         = useState('');
  const [phone, setPhone]       = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [step1Saving, setStep1Saving] = useState(false);

  // Created customer
  const [createdUserId, setCreatedUserId] = useState('');
  const [createdName, setCreatedName]     = useState('');

  // Step 2
  const [plans, setPlans]             = useState<MembershipPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [expiresAt, setExpiresAt]     = useState('');
  const [step2Saving, setStep2Saving] = useState(false);

  // Step 3
  const [cards, setCards]             = useState<TenantCard[]>([]);
  const [selectedCardId, setSelectedCardId] = useState('');
  const [cardLabel, setCardLabel]     = useState('');
  const [step3Saving, setStep3Saving] = useState(false);

  // Auto-calculate expiry when plan selection changes
  useEffect(() => {
    if (!selectedPlanId) { setExpiresAt(''); return; }
    const plan = plans.find(p => p.id === selectedPlanId);
    if (!plan) return;
    if (plan.billing_cycle === 'custom') {
      setExpiresAt('');
    } else {
      setExpiresAt(calcExpiry(plan.billing_cycle) ?? '');
    }
  }, [selectedPlanId, plans]);

  // Pre-fetch plans + unassigned cards
  useEffect(() => {
    Promise.all([
      apiGet<MembershipPlan[]>(`/tenants/${tenantId}/membership-plans`),
      apiGet<TenantCard[]>(`/tenants/${tenantId}/cards`),
    ]).then(([plRes, caRes]) => {
      setPlans((Array.isArray(plRes.data) ? plRes.data : []).filter(p => p.is_active));
      setCards((Array.isArray(caRes.data) ? caRes.data : []).filter(c => !c.customer_id));
    }).catch(() => {});
  }, [tenantId]);

  // ── Step handlers ──────────────────────────────────────────────────────────

  const submitStep1 = async () => {
    if (!email.trim() || !password) { toast.error('Email and password are required'); return; }
    setStep1Saving(true);
    try {
      await apiPost(`/tenants/${tenantId}/customers`, {
        email: email.trim(), password,
        name: name.trim() || null,
        phone: phone.trim() || null,
      });
      setCreatedUserId(email.trim()); // placeholder until we find actual user_id
      setCreatedName(name.trim() || email.trim());
      toast.success('Customer created');
      setStep(2);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Failed to create customer');
    } finally { setStep1Saving(false); }
  };

  const submitStep2 = async (skip = false) => {
    if (skip || !selectedPlanId) { setStep(3); return; }
    setStep2Saving(true);
    try {
      // We need the actual user_id — fetch customers and find by email
      const cusRes = await apiGet<Customer[]>(`/tenants/${tenantId}/customers`);
      const customers = Array.isArray(cusRes.data) ? cusRes.data : [];
      const created   = customers.find(c => c.email === email.trim());
      if (created) {
        await apiPost(`/tenants/${tenantId}/customer-subscriptions`, {
          customerId: created.user_id,
          planId: selectedPlanId,
          expiresAt: expiresAt || null,
        });
        setCreatedUserId(created.user_id);
        toast.success('Plan assigned');
      }
      setStep(3);
    } catch { toast.error('Failed to assign plan'); }
    finally { setStep2Saving(false); }
  };

  const submitStep3 = async (skip = false) => {
    if (skip || !selectedCardId) { onDone(); return; }
    setStep3Saving(true);
    try {
      // Find user_id if not yet set
      let userId = createdUserId;
      if (!userId.includes('-')) {
        const cusRes = await apiGet<Customer[]>(`/tenants/${tenantId}/customers`);
        const customers = Array.isArray(cusRes.data) ? cusRes.data : [];
        const created   = customers.find(c => c.email === email.trim());
        if (created) userId = created.user_id;
      }
      await apiPatch(`/tenants/${tenantId}/cards/${selectedCardId}`, {
        customerId: userId || null,
        label: cardLabel.trim() || null,
      });
      toast.success('Card assigned');
      onDone();
    } catch { toast.error('Failed to assign card'); }
    finally { setStep3Saving(false); }
  };

  const selectedPlan = plans.find(p => p.id === selectedPlanId);
  const selectedCard = cards.find(c => c.id === selectedCardId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-md w-[780px] min-h-[640px] shadow-2xl overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <div>
            <h2 className="text-[13px] font-bold tracking-[0.02em] text-foreground">Add Customer</h2>
            <p className="font-mono text-[9px] text-muted-foreground tracking-[0.08em] uppercase mt-0.5">
              Step {step} of 3
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <CloseIcon />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pb-5">
          <div className="flex items-center gap-0">
            {STEPS.map((s, i) => {
              const done    = step > s.n;
              const current = step === s.n;
              return (
                <div key={s.n} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center">
                    <div className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center font-mono text-[10px] font-bold border transition-all',
                      done    ? 'bg-accent border-accent text-white' :
                      current ? 'bg-primary border-primary text-primary-foreground' :
                                'bg-secondary border-border text-muted-foreground',
                    )}>
                      {done
                        ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        : s.n
                      }
                    </div>
                    <span className={cn(
                      'mt-1 font-mono text-[8px] tracking-[0.1em] uppercase whitespace-nowrap',
                      current ? 'text-foreground' : 'text-muted-foreground',
                    )}>{s.label}</span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={cn(
                      'flex-1 h-px mx-2 mb-4 transition-colors',
                      done ? 'bg-accent' : 'bg-border',
                    )} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Step content */}
        <div className="px-6 py-5 space-y-4 flex-1 min-h-[320px]">

          {/* ── Step 1: Customer info ─────────────────────────────────────── */}
          {step === 1 && (
            <>
              <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
                If this email already has an account at another gym, they&apos;ll be enrolled with their existing credentials.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1.5">Full Name</label>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" type="text"
                    className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors" />
                </div>
                <div>
                  <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1.5">Phone</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555 000 0000" type="tel"
                    className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors" />
                </div>
              </div>
              <div>
                <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1.5">Email *</label>
                <input value={email} onChange={e => setEmail(e.target.value)} placeholder="customer@email.com" type="email"
                  className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors" />
              </div>
              <div>
                <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1.5">Password *</label>
                <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Set a password for new accounts" type="password"
                  className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors" />
                <p className="mt-1 font-mono text-[9px] text-muted-foreground">Ignored if account already exists.</p>
              </div>
            </>
          )}

          {/* ── Step 2: Membership plan ───────────────────────────────────── */}
          {step === 2 && (
            <>
              <div className="px-3 py-2.5 bg-secondary rounded-lg font-mono text-[11px] text-primary tracking-[0.04em]">
                {createdName}
              </div>
              {plans.length === 0 ? (
                <div className="py-6 text-center font-mono text-[10px] text-muted-foreground">
                  No active membership plans — create plans in the Members page first.
                </div>
              ) : (
                <>
                  <SearchDrop
                    label="Membership Plan (optional)"
                    value={selectedPlanId}
                    display={selectedPlan ? `${selectedPlan.name} — $${Number(selectedPlan.price).toFixed(2)}` : ''}
                    options={plans.map(p => ({ id: p.id, label: p.name, sub: `$${Number(p.price).toFixed(2)}` }))}
                    onSelect={setSelectedPlanId}
                    onClear={() => setSelectedPlanId('')}
                  />
                  {selectedPlanId && (() => {
                    const plan = plans.find(p => p.id === selectedPlanId);
                    if (!plan) return null;
                    if (plan.billing_cycle === 'one_time') return (
                      <div className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-md">
                        <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-muted-foreground">Expiry</span>
                        <span className="font-mono text-[11px] text-foreground">No expiry</span>
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
                        <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-muted-foreground">Expires</span>
                        <span className="font-mono text-[11px] text-foreground">
                          {expiresAt ? new Date(expiresAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
                        </span>
                        <span className="ml-auto font-mono text-[9px] text-muted-foreground uppercase tracking-[0.06em]">{CYCLE_LABELS[plan.billing_cycle]}</span>
                      </div>
                    );
                  })()}
                </>
              )}
            </>
          )}

          {/* ── Step 3: Assign card ───────────────────────────────────────── */}
          {step === 3 && (
            <>
              <div className="px-3 py-2.5 bg-secondary rounded-lg font-mono text-[11px] text-primary tracking-[0.04em]">
                {createdName}
              </div>
              {cards.length === 0 ? (
                <div className="py-6 text-center font-mono text-[10px] text-muted-foreground">
                  No unassigned cards available — issue cards to this tenant first.
                </div>
              ) : (
                <>
                  <SearchDrop
                    label="RFID Card (optional)"
                    value={selectedCardId}
                    display={selectedCard ? selectedCard.uid : ''}
                    options={cards.map(c => ({ id: c.id, label: c.uid, sub: c.label ?? undefined }))}
                    onSelect={setSelectedCardId}
                    onClear={() => setSelectedCardId('')}
                  />
                  {selectedCardId && (
                    <div>
                      <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1.5">Card Label (optional)</label>
                      <input value={cardLabel} onChange={e => setCardLabel(e.target.value)} placeholder="e.g. Main entrance key"
                        className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors" />
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4 flex items-center justify-between gap-3 bg-secondary/30">
          {/* Left: back or cancel */}
          <button
            onClick={step === 1 ? onClose : () => setStep(s => s - 1)}
            className="h-9 px-4 font-mono text-[10px] tracking-[0.08em] uppercase bg-secondary border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
          >
            {step === 1 ? 'Cancel' : '← Back'}
          </button>

          {/* Right: skip + next/finish */}
          <div className="flex items-center gap-2">
            {step === 2 && (
              <button
                onClick={() => submitStep2(true)}
                className="h-9 px-4 font-mono text-[10px] tracking-[0.08em] uppercase text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip
              </button>
            )}
            {step === 3 && (
              <button
                onClick={() => submitStep3(true)}
                className="h-9 px-4 font-mono text-[10px] tracking-[0.08em] uppercase text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip
              </button>
            )}
            {step === 1 && (
              <button
                onClick={submitStep1}
                disabled={step1Saving}
                className="h-9 px-5 bg-primary text-primary-foreground font-mono text-[10px] tracking-[0.1em] uppercase rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {step1Saving ? 'Creating…' : 'Next →'}
              </button>
            )}
            {step === 2 && (
              <button
                onClick={() => submitStep2(false)}
                disabled={step2Saving}
                className="h-9 px-5 bg-primary text-primary-foreground font-mono text-[10px] tracking-[0.1em] uppercase rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {step2Saving ? 'Saving…' : selectedPlanId ? 'Assign & Next →' : 'Next →'}
              </button>
            )}
            {step === 3 && (
              <button
                onClick={() => submitStep3(false)}
                disabled={step3Saving}
                className="h-9 px-5 bg-primary text-primary-foreground font-mono text-[10px] tracking-[0.1em] uppercase rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {step3Saving ? 'Saving…' : selectedCardId ? 'Assign & Finish' : 'Finish'}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

// ── Page ───────────────────────────────────────────────────────────────────────

const TenantCustomersPage = () => {
  const { tenant: tenantId } = useParams<{ tenant: string }>();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(true);

  const [modalOpen, setModalOpen]           = useState(false);
  const [removeTarget, setRemoveTarget]     = useState<Customer | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<Customer[]>(`/tenants/${tenantId}/customers`);
      setCustomers(Array.isArray(res.data) ? res.data : []);
    } catch { toast.error('Failed to load customers'); }
    finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const removeCustomer = async () => {
    if (!removeTarget) return;
    try {
      await apiDelete(`/tenants/${tenantId}/customers/${removeTarget.user_id}`);
      toast.success('Customer removed');
      setRemoveTarget(null);
      load();
    } catch { toast.error('Failed to remove customer'); }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-sm font-bold tracking-[0.04em] text-foreground uppercase">Customers</h1>
          <p className="font-mono text-[10px] text-muted-foreground tracking-[0.06em] mt-1">
            {customers.length} member{customers.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="bg-primary text-primary-foreground border-none rounded-md px-4 py-2 text-[13px] font-bold tracking-[0.06em] uppercase cursor-pointer hover:opacity-90 transition-opacity"
        >
          + Add Customer
        </button>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              {['ID', 'Name', 'Email', 'Phone', 'Joined', 'Created', ''].map(h => (
                <th key={h} className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground px-5 py-2.5 text-left font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="p-10 text-center font-mono text-[11px] text-muted-foreground">Loading...</td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={7} className="p-10 text-center font-mono text-[11px] text-muted-foreground">No customers yet — add your first member.</td></tr>
            ) : customers.map(c => (
              <tr key={c.id} className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors group">
                <td className="px-5 py-3 font-mono text-[10px] text-primary tracking-[0.06em]">{c.code}</td>
                <td className="px-5 py-3 text-[13px] font-semibold text-foreground">{c.name ?? <span className="text-muted-foreground font-normal">—</span>}</td>
                <td className="px-5 py-3 text-[12px] text-foreground">{c.email}</td>
                <td className="px-5 py-3 font-mono text-[11px] text-muted-foreground">{c.phone ?? '—'}</td>
                <td className="px-5 py-3"><DateTime value={c.joined_at} format="date" /></td>
                <td className="px-5 py-3"><DateTime value={c.created_at} format="datetime" /></td>
                <td className="px-5 py-3">
                  <button
                    onClick={() => setRemoveTarget(c)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity font-mono text-[9px] tracking-[0.06em] uppercase px-2.5 py-1 bg-muted border border-border text-muted-foreground rounded hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive transition-colors"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Multi-step add customer modal */}
      {modalOpen && (
        <AddCustomerModal
          tenantId={tenantId}
          onClose={() => setModalOpen(false)}
          onDone={() => { setModalOpen(false); load(); }}
        />
      )}

      {/* Remove confirm */}
      {removeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-xl p-6 w-[340px] shadow-2xl">
            <div className="text-[13px] font-bold text-foreground mb-1">Remove Customer?</div>
            <div className="font-mono text-[11px] text-primary mb-1">{removeTarget.email}</div>
            <div className="font-mono text-[10px] text-muted-foreground mb-5">
              This removes them from your customer list only. Their account and credentials are not deleted — they can still log in and may belong to other gyms.
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setRemoveTarget(null)}
                className="flex-1 h-9 bg-secondary border border-border rounded-md font-mono text-[10px] uppercase text-muted-foreground hover:bg-primary/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={removeCustomer}
                className="flex-1 h-9 bg-destructive text-white rounded-md font-mono text-[10px] uppercase hover:bg-destructive/90 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TenantCustomersPage;
