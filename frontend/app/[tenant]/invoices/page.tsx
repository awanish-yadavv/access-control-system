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

interface CustomerSubscription {
  id: string;
  code: string;
  customer_id: string;
  plan_name: string;
  status: string;
}

interface CustomerInvoice {
  id: string;
  code: string;
  customer_id: string;
  customer_email: string;
  subscription_id: string | null;
  amount: number;
  gst_rate: number | null;
  gst_amount: number | null;
  description: string | null;
  status: 'unpaid' | 'paid' | 'void';
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
}

// ── Badge map ─────────────────────────────────────────────────────────────────

const INV_BADGE: Record<string, string> = {
  paid:   'bg-accent/15 text-accent border-accent/25',
  unpaid: 'bg-destructive/12 text-destructive border-destructive/25',
  void:   'bg-muted text-muted-foreground border-border',
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

const FieldInput = ({
  label, value, onChange, type = 'text', placeholder = '', required = false,
}: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; required?: boolean }) => (
  <div>
    <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1.5">
      {label}{required && ' *'}
    </label>
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors" />
  </div>
);

// ── Page ──────────────────────────────────────────────────────────────────────

const TenantInvoicesPage = () => {
  const { tenant: tenantId } = useParams<{ tenant: string }>();

  const [invoices, setInvoices]         = useState<CustomerInvoice[]>([]);
  const [loading, setLoading]           = useState(true);
  const [customers, setCustomers]       = useState<TenantCustomer[]>([]);
  const [subscriptions, setSubscriptions] = useState<CustomerSubscription[]>([]);

  // Create panel state
  const [panelOpen, setPanelOpen]       = useState(false);
  const [customerId, setCustomerId]     = useState('');
  const [subscriptionId, setSubscriptionId] = useState('');
  const [amount, setAmount]             = useState('');
  const [description, setDescription]  = useState('');
  const [notes, setNotes]              = useState('');
  const [dueDate, setDueDate]           = useState('');
  const [saving, setSaving]             = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<CustomerInvoice[]>(`/tenants/${tenantId}/customer-invoices`);
      setInvoices(Array.isArray(res.data) ? res.data : []);
    } catch { toast.error('Failed to load invoices'); }
    finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => {
    load();
    apiGet<TenantCustomer[]>(`/tenants/${tenantId}/customers`)
      .then(res => setCustomers(Array.isArray(res.data) ? res.data : []))
      .catch(() => {});
    apiGet<CustomerSubscription[]>(`/tenants/${tenantId}/customer-subscriptions`)
      .then(res => setSubscriptions(Array.isArray(res.data) ? res.data : []))
      .catch(() => {});
  }, [tenantId, load]);

  const openCreate = () => {
    setCustomerId(''); setSubscriptionId(''); setAmount('');
    setDescription(''); setNotes(''); setDueDate('');
    setPanelOpen(true);
  };

  const create = async () => {
    if (!customerId || !amount) { toast.error('Customer and amount are required'); return; }
    setSaving(true);
    try {
      await apiPost(`/tenants/${tenantId}/customer-invoices`, {
        customerId,
        subscriptionId: subscriptionId || null,
        amount: parseFloat(amount),
        description: description || null,
        notes: notes || null,
        dueDate: dueDate || null,
      });
      toast.success('Invoice created');
      setPanelOpen(false);
      load();
    } catch { toast.error('Failed to create invoice'); }
    finally { setSaving(false); }
  };

  const pay = async (invId: string) => {
    try {
      await apiPatch(`/tenants/${tenantId}/customer-invoices/${invId}`, { status: 'paid', paidAt: new Date().toISOString() });
      toast.success('Invoice marked as paid');
      load();
    } catch { toast.error('Failed to update invoice'); }
  };

  const voidInv = async (invId: string) => {
    try {
      await apiPatch(`/tenants/${tenantId}/customer-invoices/${invId}`, { status: 'void' });
      toast.success('Invoice voided');
      load();
    } catch { toast.error('Failed to void invoice'); }
  };

  const printInvoice = (invId: string) => {
    window.open(`/${tenantId}/invoices/${invId}`, '_blank');
  };

  const unpaidTotal = invoices.filter(i => i.status === 'unpaid').reduce((s, i) => s + Number(i.amount) + Number(i.gst_amount ?? 0), 0);
  const selectedCustomer = customers.find(u => u.user_id === customerId);

  // Filter subscriptions to selected customer
  const customerSubs = subscriptions.filter(s => s.customer_id === customerId && s.status === 'active');
  const selectedSub  = subscriptions.find(s => s.id === subscriptionId);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-sm font-bold tracking-[0.04em] text-foreground uppercase">Invoices</h1>
          <p className="font-mono text-[10px] text-muted-foreground tracking-[0.06em] mt-1">
            Member invoices &amp; payment tracking
          </p>
        </div>
        <button onClick={openCreate}
          className="bg-primary text-primary-foreground border-none rounded-md px-4 py-2 text-[13px] font-bold tracking-[0.06em] uppercase cursor-pointer hover:opacity-90 transition-opacity">
          + Ad-hoc Invoice
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground mb-2">Total</div>
          <div className="text-2xl font-bold text-foreground">{invoices.length}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground mb-2">Unpaid</div>
          <div className={cn('text-2xl font-bold', unpaidTotal > 0 ? 'text-destructive' : 'text-foreground')}>
            {invoices.filter(i => i.status === 'unpaid').length}
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground mb-2">Outstanding</div>
          <div className={cn('text-2xl font-mono font-bold', unpaidTotal > 0 ? 'text-destructive' : 'text-accent')}>
            ₹{unpaidTotal.toFixed(2)}
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground mb-2">Paid</div>
          <div className="text-2xl font-bold text-accent">{invoices.filter(i => i.status === 'paid').length}</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              {['Invoice #', 'Customer', 'Base', 'GST', 'Total', 'Status', 'Due', 'Paid At', 'Created', 'Actions'].map(h => (
                <th key={h} className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground px-4 py-2.5 text-left font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="p-10 text-center font-mono text-[11px] text-muted-foreground">Loading…</td></tr>
            ) : invoices.length === 0 ? (
              <tr><td colSpan={10} className="p-10 text-center font-mono text-[11px] text-muted-foreground">No invoices yet</td></tr>
            ) : invoices.map(inv => {
              const total = Number(inv.amount) + Number(inv.gst_amount ?? 0);
              return (
                <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors group">
                  <td className="px-4 py-3 font-mono text-[10px] text-primary tracking-[0.06em]">{inv.code}</td>
                  <td className="px-4 py-3 text-[12px] text-foreground">{inv.customer_email}</td>
                  <td className="px-4 py-3 font-mono text-[12px] font-semibold text-foreground">₹{Number(inv.amount).toFixed(2)}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                    {inv.gst_amount != null ? (
                      <span className="text-accent">+₹{Number(inv.gst_amount).toFixed(2)}</span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] font-bold text-foreground">₹{total.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={cn('font-mono text-[9px] tracking-[0.1em] uppercase px-2 py-0.5 rounded-[3px] border', INV_BADGE[inv.status])}>{inv.status}</span>
                  </td>
                  <td className="px-4 py-3"><DateTime value={inv.due_date} format="date" /></td>
                  <td className="px-4 py-3"><DateTime value={inv.paid_at} format="datetime" /></td>
                  <td className="px-4 py-3"><DateTime value={inv.created_at} format="datetime" /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => printInvoice(inv.id)}
                        className="font-mono text-[9px] px-2 py-0.5 bg-secondary border border-border rounded hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-colors">
                        Print
                      </button>
                      {inv.status === 'unpaid' && (
                        <>
                          <button onClick={() => pay(inv.id)}
                            className="font-mono text-[9px] px-2 py-0.5 bg-accent/10 border border-accent/30 text-accent rounded hover:bg-accent/20 transition-colors">
                            Pay
                          </button>
                          <button onClick={() => voidInv(inv.id)}
                            className="font-mono text-[9px] px-2 py-0.5 bg-muted border border-border rounded hover:bg-secondary transition-colors">
                            Void
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Ad-hoc Invoice panel */}
      <Panel open={panelOpen} onClose={() => setPanelOpen(false)} title="Ad-hoc Invoice">
        <SearchDrop
          label="Customer *"
          value={customerId}
          display={selectedCustomer ? (selectedCustomer.name ? `${selectedCustomer.name} (${selectedCustomer.email})` : selectedCustomer.email) : ''}
          options={customers.map(u => ({ id: u.user_id, label: u.name ? `${u.name} (${u.email})` : u.email }))}
          onSelect={id => { setCustomerId(id); setSubscriptionId(''); }}
          onClear={() => { setCustomerId(''); setSubscriptionId(''); }}
        />
        {customerId && (
          <SearchDrop
            label="Link to Subscription (optional)"
            value={subscriptionId}
            display={selectedSub ? `${selectedSub.code} — ${selectedSub.plan_name}` : ''}
            options={[
              { id: '', label: 'None (standalone ad-hoc)' },
              ...customerSubs.map(s => ({ id: s.id, label: `${s.code} — ${s.plan_name}` })),
            ]}
            onSelect={setSubscriptionId}
            onClear={() => setSubscriptionId('')}
          />
        )}
        <FieldInput label="Amount (₹)" value={amount} onChange={setAmount} type="number" placeholder="0.00" required />
        <p className="text-[10px] font-mono text-muted-foreground -mt-2">
          GST will be computed automatically based on tenant &amp; plan settings.
        </p>
        <FieldInput label="Description (optional)" value={description} onChange={setDescription} placeholder="Invoice description…" />
        <div>
          <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1.5">Notes (optional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes…" rows={3}
            className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors resize-none" />
        </div>
        <FieldInput label="Due Date (optional)" value={dueDate} onChange={setDueDate} type="datetime-local" />
        <button onClick={create} disabled={saving}
          className="w-full mt-2 h-10 bg-primary text-primary-foreground font-mono text-[10px] tracking-[0.1em] uppercase rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50">
          {saving ? 'Creating…' : 'Create Invoice'}
        </button>
      </Panel>
    </div>
  );
};

export default TenantInvoicesPage;
