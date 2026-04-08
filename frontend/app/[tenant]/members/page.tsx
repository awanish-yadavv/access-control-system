'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';
import cn from '@/lib/cn';
import toast from 'react-hot-toast';
import DateTime from '@/components/ui/DateTime';

// ── Interfaces ────────────────────────────────────────────────────────────────

interface MembershipPlan {
  id: string;
  name: string;
  price: number;
  billing_cycle: 'daily' | 'monthly' | 'quarterly' | 'half_year' | 'annual' | 'one_time' | 'custom';
  features: Record<string, string | boolean>;
  gst_rate: number | null;
  is_active: boolean;
  created_at: string;
}

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

type Features = Record<string, string>;
const FeaturesBuilder = ({ features, onChange }: { features: Features; onChange: (f: Features) => void }) => {
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const addFeature = () => {
    if (!newKey.trim()) return;
    onChange({ ...features, [newKey.trim()]: newVal.trim() });
    setNewKey(''); setNewVal('');
  };
  return (
    <div className="space-y-1.5">
      {Object.entries(features).map(([k, v]) => (
        <div key={k} className="flex items-center gap-2">
          <div className="flex-1 bg-secondary border border-border rounded px-2.5 py-1.5 font-mono text-[11px] text-foreground">{k}</div>
          <div className="flex-1 bg-secondary border border-border rounded px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">{String(v)}</div>
          <button type="button" onClick={() => { const f = { ...features }; delete f[k]; onChange(f); }}
            className="text-muted-foreground hover:text-destructive p-1 transition-colors"><CloseIcon /></button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="Feature name"
          className="flex-1 bg-secondary border border-border rounded px-2.5 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addFeature())} />
        <input value={newVal} onChange={e => setNewVal(e.target.value)} placeholder="Value"
          className="flex-1 bg-secondary border border-border rounded px-2.5 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addFeature())} />
        <button type="button" onClick={addFeature}
          className="px-2.5 py-1.5 bg-primary/10 border border-primary/30 text-primary text-[11px] font-mono rounded hover:bg-primary/20 transition-colors">
          Add
        </button>
      </div>
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

// ── Tab 1: Membership Plans ───────────────────────────────────────────────────

type PlanFormState = {
  name: string; price: string;
  billingCycle: 'daily' | 'monthly' | 'quarterly' | 'half_year' | 'annual' | 'one_time' | 'custom';
  features: Record<string, string>;
  gstRateStr: string;   // '' = inherit
  isActive: boolean;
};
const EMPTY_PLAN: PlanFormState = { name: '', price: '', billingCycle: 'monthly', features: {}, gstRateStr: '', isActive: true };
const GST_PRESETS = [0, 5, 12, 18, 28];

const MembershipPlansTab = ({ tenantId }: { tenantId: string }) => {
  const [plans, setPlans]         = useState<MembershipPlan[]>([]);
  const [loading, setLoading]     = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing]     = useState<MembershipPlan | null>(null);
  const [form, setForm]           = useState<PlanFormState>(EMPTY_PLAN);
  const [saving, setSaving]       = useState(false);
  const [deleteId, setDeleteId]   = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<MembershipPlan[]>(`/tenants/${tenantId}/membership-plans`);
      setPlans(Array.isArray(res.data) ? res.data : []);
    } catch { toast.error('Failed to load membership plans'); }
    finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_PLAN); setPanelOpen(true); };
  const openEdit   = (p: MembershipPlan) => {
    setEditing(p);
    setForm({ name: p.name, price: String(p.price), billingCycle: p.billing_cycle, features: p.features as Record<string, string>, gstRateStr: p.gst_rate != null ? String(p.gst_rate) : '', isActive: p.is_active });
    setPanelOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.price) { toast.error('Name and price are required'); return; }
    setSaving(true);
    try {
      const gstRate = form.gstRateStr !== '' ? parseFloat(form.gstRateStr) : null;
      const payload = { name: form.name, price: parseFloat(form.price), billingCycle: form.billingCycle, features: form.features, gstRate, isActive: form.isActive };
      if (editing) {
        await apiPatch(`/tenants/${tenantId}/membership-plans/${editing.id}`, payload);
        toast.success('Plan updated');
      } else {
        await apiPost(`/tenants/${tenantId}/membership-plans`, payload);
        toast.success('Plan created');
      }
      setPanelOpen(false); load();
    } catch { toast.error('Failed to save plan'); }
    finally { setSaving(false); }
  };

  const deletePlan = async (id: string) => {
    try {
      await apiDelete(`/tenants/${tenantId}/membership-plans/${id}`);
      toast.success('Plan deleted');
      setDeleteId(null); load();
    } catch { toast.error('Failed to delete plan'); }
  };

  const CYCLE_LABELS: Record<string, string> = {
    daily: 'Daily', monthly: 'Monthly', quarterly: 'Quarterly',
    half_year: 'Half Year', annual: 'Annual', one_time: 'One-time', custom: 'Custom',
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="font-mono text-[10px] text-muted-foreground">{plans.length} plan{plans.length !== 1 ? 's' : ''}</div>
        <button onClick={openCreate}
          className="h-8 px-4 bg-primary text-primary-foreground font-mono text-[10px] tracking-[0.1em] uppercase rounded-md hover:bg-primary/90 transition-colors">
          + New Plan
        </button>
      </div>

      {loading ? (
        <div className="p-10 text-center font-mono text-[11px] text-muted-foreground">Loading…</div>
      ) : plans.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">No membership plans yet</div>
          <div className="mt-1 text-[12px] text-muted-foreground">Create plans to offer your members.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {plans.map(p => (
            <div key={p.id} className="bg-card border border-border rounded-xl p-5 flex items-center justify-between group">
              <div className="flex items-center gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-bold text-foreground">{p.name}</span>
                    {!p.is_active && (
                      <span className="font-mono text-[9px] tracking-[0.1em] uppercase px-2 py-0.5 rounded-[3px] border bg-muted text-muted-foreground border-border">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-sm text-primary mt-0.5">
                    ${Number(p.price).toFixed(2)}<span className="text-[10px] text-muted-foreground">/{CYCLE_LABELS[p.billing_cycle].toLowerCase()}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-[9px] font-mono text-muted-foreground">
                    <span className="uppercase tracking-[0.08em]">Created</span>
                    <DateTime value={p.created_at} format="datetime" />
                  </div>
                </div>
                {Object.keys(p.features).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 ml-4">
                    {Object.entries(p.features).slice(0, 4).map(([k, v]) => (
                      <span key={k} className="px-2 py-0.5 bg-secondary border border-border rounded font-mono text-[9px] text-muted-foreground">
                        {k}: {String(v)}
                      </span>
                    ))}
                    {Object.keys(p.features).length > 4 && (
                      <span className="px-2 py-0.5 bg-secondary border border-border rounded font-mono text-[9px] text-muted-foreground">
                        +{Object.keys(p.features).length - 4} more
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => openEdit(p)}
                  className="h-7 px-3 font-mono text-[9px] tracking-[0.06em] uppercase bg-secondary border border-border rounded hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-colors">
                  Edit
                </button>
                <button onClick={() => setDeleteId(p.id)}
                  className="h-7 px-3 font-mono text-[9px] tracking-[0.06em] uppercase bg-secondary border border-border rounded hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive transition-colors">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Panel open={panelOpen} onClose={() => setPanelOpen(false)} title={editing ? 'Edit Plan' : 'New Membership Plan'}>
        <FieldInput label="Plan Name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="e.g. Monthly Membership" required />
        <FieldInput label="Price" value={form.price} onChange={v => setForm(f => ({ ...f, price: v }))} type="number" placeholder="0.00" required />
        <div>
          <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1.5">Billing Cycle *</label>
          <div className="grid grid-cols-4 gap-2">
            {(['daily', 'monthly', 'quarterly', 'half_year', 'annual', 'one_time', 'custom'] as const).map(c => (
              <button key={c} type="button" onClick={() => setForm(f => ({ ...f, billingCycle: c }))}
                className={cn(
                  'py-2 font-mono text-[10px] tracking-[0.06em] uppercase rounded-md border transition-colors',
                  form.billingCycle === c
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-secondary text-muted-foreground border-border hover:bg-primary/10 hover:border-primary/30 hover:text-primary',
                )}>
                {CYCLE_LABELS[c]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-2">GST Rate for this Plan (%)</label>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={form.gstRateStr}
              onChange={e => setForm(f => ({ ...f, gstRateStr: e.target.value }))}
              placeholder="e.g. 18"
              className="w-24 bg-secondary border border-border rounded-md px-3 py-2 text-[13px] font-mono text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
            />
            <span className="text-[13px] text-muted-foreground font-mono">%</span>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, gstRateStr: '' }))}
              className={cn(
                'px-3 py-1.5 rounded border font-mono text-[10px] transition-colors',
                form.gstRateStr === ''
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-secondary text-muted-foreground border-border hover:border-primary/40',
              )}
            >
              Inherit
            </button>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {GST_PRESETS.map(rate => (
              <button
                key={rate}
                type="button"
                onClick={() => setForm(f => ({ ...f, gstRateStr: String(rate) }))}
                className={cn(
                  'px-3 py-1 rounded border font-mono text-[10px] transition-colors',
                  parseFloat(form.gstRateStr) === rate && form.gstRateStr !== ''
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-secondary text-muted-foreground border-border hover:border-primary/40',
                )}
              >
                {rate}%
              </button>
            ))}
          </div>
          <p className="text-[10px] font-mono text-muted-foreground mt-1.5">
            Leave empty (&ldquo;Inherit&rdquo;) to use the tenant&apos;s default GST rate.
          </p>
        </div>
        <div>
          <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1.5">Active</label>
          <button type="button" onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
            className={cn('relative inline-flex h-5 w-9 rounded-full transition-colors', form.isActive ? 'bg-accent' : 'bg-muted')}>
            <span className={cn('absolute top-0.5 left-0.5 h-4 w-4 bg-white rounded-full shadow transition-transform', form.isActive ? 'translate-x-4' : 'translate-x-0')} />
          </button>
        </div>
        <div>
          <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1.5">Features</label>
          <FeaturesBuilder features={form.features} onChange={f => setForm(s => ({ ...s, features: f }))} />
        </div>
        <button onClick={save} disabled={saving}
          className="w-full mt-2 h-10 bg-primary text-primary-foreground font-mono text-[10px] tracking-[0.1em] uppercase rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50">
          {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Plan'}
        </button>
      </Panel>

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-xl p-6 w-[320px] shadow-2xl">
            <div className="text-[13px] font-bold text-foreground mb-2">Delete Plan?</div>
            <div className="font-mono text-[10px] text-muted-foreground mb-5">
              This cannot be undone. Active subscriptions may be affected.
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDeleteId(null)} className="flex-1 h-9 bg-secondary border border-border rounded-md font-mono text-[10px] uppercase text-muted-foreground hover:bg-primary/10 transition-colors">Cancel</button>
              <button onClick={() => deletePlan(deleteId)} className="flex-1 h-9 bg-destructive text-white rounded-md font-mono text-[10px] uppercase hover:bg-destructive/90 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

const TenantMembersPage = () => {
  const { tenant: tenantId } = useParams<{ tenant: string }>();

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-sm font-bold tracking-[0.04em] text-foreground uppercase">Members</h1>
        <p className="font-mono text-[10px] text-muted-foreground tracking-[0.06em] mt-1">
          Membership plans
        </p>
      </div>
      <MembershipPlansTab tenantId={tenantId} />
    </div>
  );
};

export default TenantMembersPage;
