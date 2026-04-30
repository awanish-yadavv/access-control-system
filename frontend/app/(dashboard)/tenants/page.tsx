'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';
import PermissionGuard from '@/components/auth/PermissionGuard';
import cn from '@/lib/cn';
import toast from 'react-hot-toast';
import DateTime from '@/components/ui/DateTime';

interface Tenant {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: 'active' | 'suspended' | 'inactive';
  owner: { id: string; email: string } | null;
  createdAt: string;
}

interface UserOption {
  id: string;
  email: string;
  userType: string;
}

interface PlanOption {
  id: string;
  name: string;
  price: number;
}

const STATUS_BADGE: Record<string, string> = {
  active:    'bg-accent/15 text-accent border-accent/25',
  suspended: 'bg-destructive/12 text-destructive border-destructive/25',
  inactive:  'bg-muted text-muted-foreground border-border',
};

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

interface SearchDropProps {
  label: string;
  value: string;
  display: string;
  options: { id: string; label: string; sub?: string }[];
  onSelect: (id: string) => void;
  onClear?: () => void;
  placeholder?: string;
}

const SearchDrop = ({ label, value, display, options, onSelect, onClear, placeholder = 'Search…' }: SearchDropProps) => {
  const [open, setOpen] = useState(false);
  const [q, setQ]       = useState('');
  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(q.toLowerCase()) ||
    (o.sub ?? '').toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="relative">
      <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1.5">{label}</label>
      <button
        type="button"
        onClick={() => { setOpen(!open); setQ(''); }}
        className="w-full flex items-center justify-between bg-secondary border border-border rounded-md px-3 py-2 text-left"
      >
        <span className={cn('text-[13px]', value ? 'text-foreground' : 'text-muted-foreground')}>
          {value ? display : `Select ${label.toLowerCase()}…`}
        </span>
        <div className="flex items-center gap-1.5">
          {value && onClear && (
            <span
              role="button"
              tabIndex={0}
              onClick={e => { e.stopPropagation(); onClear(); }}
              onKeyDown={e => e.key === 'Enter' && (e.stopPropagation(), onClear?.())}
              className="text-muted-foreground hover:text-foreground p-0.5"
            >
              <CloseIcon />
            </span>
          )}
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className="text-muted-foreground">
            <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-card border border-border rounded-md shadow-lg overflow-hidden">
          <div className="p-2 border-b border-border">
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={placeholder}
              className="w-full bg-secondary rounded px-2.5 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-3 text-center font-mono text-[10px] text-muted-foreground">No results</div>
            ) : filtered.map(o => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onSelect(o.id); setOpen(false); }}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 text-left hover:bg-secondary transition-colors',
                  o.id === value && 'bg-accent/10',
                )}
              >
                <span className="text-[13px] text-foreground">{o.label}</span>
                {o.sub && <span className="font-mono text-[10px] text-muted-foreground">{o.sub}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const TenantsPage = () => {
  const [tenants, setTenants]   = useState<Tenant[]>([]);
  const [loading, setLoading]   = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);

  // Form state
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [ownerId, setOwnerId]     = useState('');
  const [planId, setPlanId]       = useState('');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual' | 'one_time'>('monthly');
  const [saving, setSaving]       = useState(false);

  // Dropdown data
  const [users, setUsers]   = useState<UserOption[]>([]);
  const [plans, setPlans]   = useState<PlanOption[]>([]);

  // Row actions
  const [busyId, setBusyId]             = useState<string | null>(null);
  const [confirmTenant, setConfirmTenant] = useState<Tenant | null>(null);
  const [confirmInput, setConfirmInput]   = useState('');

  const load = async () => {
    try {
      const res = await apiGet<Tenant[]>('/tenants');
      setTenants(Array.isArray(res.data) ? res.data : []);
    } catch { toast.error('Failed to load tenants'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openPanel = async () => {
    setNameInput(''); setEmailInput(''); setPhoneInput(''); setOwnerId(''); setPlanId(''); setBillingCycle('monthly');
    setPanelOpen(true);
    try {
      const [usRes, plRes] = await Promise.all([
        apiGet<UserOption[]>('/users'),
        apiGet<PlanOption[]>('/plans'),
      ]);
      setUsers(Array.isArray(usRes.data) ? usRes.data : []);
      setPlans(Array.isArray(plRes.data) ? plRes.data : []);
    } catch {}
  };

  const createTenant = async () => {
    if (!nameInput.trim() || !ownerId) { toast.error('Name and owner are required'); return; }
    setSaving(true);
    try {
      const res = await apiPost<Tenant>('/tenants', {
        name: nameInput.trim(),
        ownerId,
        email: emailInput.trim() || null,
        phone: phoneInput.trim() || null,
      });
      const newTenant = res.data;
      // If a plan was selected, subscribe right away
      if (planId && newTenant?.id) {
        try {
          await apiPost(`/tenants/${newTenant.id}/subscriptions`, { planId, billingCycle });
        } catch {
          toast.error('Tenant created but subscription failed — add it from Billing');
        }
      }
      toast.success('Tenant onboarded');
      setPanelOpen(false);
      load();
    } catch { toast.error('Failed to create tenant'); }
    finally { setSaving(false); }
  };

  const toggleStatus = async (t: Tenant) => {
    const next = t.status === 'active' ? 'inactive' : 'active';
    setBusyId(t.id);
    try {
      await apiPatch<Tenant>(`/tenants/${t.id}`, { status: next });
      toast.success(next === 'active' ? 'Tenant enabled' : 'Tenant disabled');
      load();
    } catch { toast.error('Failed to update status'); }
    finally { setBusyId(null); }
  };

  const openDeleteConfirm = (t: Tenant) => {
    setConfirmTenant(t);
    setConfirmInput('');
  };

  const confirmDelete = async () => {
    if (!confirmTenant) return;
    if (confirmInput.trim() !== confirmTenant.name) {
      toast.error('Tenant name does not match');
      return;
    }
    setBusyId(confirmTenant.id);
    try {
      await apiDelete(`/tenants/${confirmTenant.id}`);
      toast.success('Tenant deleted');
      setConfirmTenant(null);
      setConfirmInput('');
      load();
    } catch { toast.error('Failed to delete tenant'); }
    finally { setBusyId(null); }
  };

  const selectedUser = users.find(u => u.id === ownerId);
  const selectedPlan = plans.find(p => p.id === planId);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-sm font-bold tracking-[0.04em] text-foreground uppercase">Tenants</h1>
          <p className="font-mono text-[10px] text-muted-foreground tracking-[0.06em] mt-1">Customer tenant registry</p>
        </div>
        <PermissionGuard entity="tenants" action="create">
          <button
            onClick={openPanel}
            className="bg-primary text-primary-foreground border-none rounded-md px-4 py-2 text-[13px] font-bold tracking-[0.06em] uppercase cursor-pointer hover:opacity-90 transition-opacity"
          >
            + Onboard Tenant
          </button>
        </PermissionGuard>
      </div>

      {/* Tenants table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              {['Name', 'Email', 'Phone', 'Owner', 'Status', 'Schema', 'Created', ''].map(h => (
                <th key={h} className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground px-5 py-2.5 text-left font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="p-10 text-center font-mono text-[11px] text-muted-foreground">Loading...</td></tr>
            ) : tenants.length === 0 ? (
              <tr><td colSpan={8} className="p-10 text-center font-mono text-[11px] text-muted-foreground">No tenants onboarded</td></tr>
            ) : tenants.map(t => (
              <tr key={t.id} className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors">
                <td className="px-5 py-3 text-[13px] font-semibold text-foreground">{t.name}</td>
                <td className="px-5 py-3 font-mono text-[10px] text-muted-foreground">{t.email ?? '—'}</td>
                <td className="px-5 py-3 font-mono text-[10px] text-muted-foreground">{t.phone ?? '—'}</td>
                <td className="px-5 py-3 font-mono text-[10px] text-muted-foreground">{t.owner?.email ?? '—'}</td>
                <td className="px-5 py-3">
                  <span className={cn('font-mono text-[9px] tracking-[0.1em] uppercase px-2 py-0.5 rounded-[3px] border', STATUS_BADGE[t.status] ?? STATUS_BADGE.inactive)}>
                    {t.status}
                  </span>
                </td>
                <td className="px-5 py-3 font-mono text-[9px] text-muted-foreground tracking-[0.04em]">tenant_{t.id.slice(0, 8)}</td>
                <td className="px-5 py-3"><DateTime value={t.createdAt} format="datetime" /></td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <Link href={`/${t.id}`} className="font-mono text-[9px] tracking-[0.1em] uppercase px-2 py-1 rounded-[3px] border border-primary/30 text-primary hover:bg-primary/10 transition-colors">
                      View Portal →
                    </Link>
                    <PermissionGuard entity="tenants" action="update">
                      <button
                        onClick={() => toggleStatus(t)}
                        disabled={busyId === t.id}
                        className="font-mono text-[9px] tracking-[0.1em] uppercase px-2 py-1 rounded-[3px] border border-border text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-40"
                      >
                        {t.status === 'active' ? 'Disable' : 'Enable'}
                      </button>
                    </PermissionGuard>
                    <PermissionGuard entity="tenants" action="delete">
                      <button
                        onClick={() => openDeleteConfirm(t)}
                        disabled={busyId === t.id}
                        className="font-mono text-[9px] tracking-[0.1em] uppercase px-2 py-1 rounded-[3px] border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </PermissionGuard>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Slide-in panel */}
      {panelOpen && <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setPanelOpen(false)} />}
      <div className={cn(
        'fixed top-0 right-0 h-full w-[420px] z-50 bg-background border-l border-border shadow-2xl transition-transform duration-300',
        panelOpen ? 'translate-x-0' : 'translate-x-full',
      )}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <h2 className="text-[11px] font-mono tracking-[0.14em] uppercase text-foreground">Onboard Tenant</h2>
          <button onClick={() => setPanelOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors"><CloseIcon /></button>
        </div>

        <div className="overflow-y-auto h-[calc(100%-61px)] px-6 py-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1.5">Tenant Name *</label>
            <input
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              placeholder="Acme Fitness"
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1.5">Tenant Email</label>
            <input
              type="email"
              value={emailInput}
              onChange={e => setEmailInput(e.target.value)}
              placeholder="contact@gymname.com"
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1.5">Tenant Phone</label>
            <input
              type="tel"
              value={phoneInput}
              onChange={e => setPhoneInput(e.target.value)}
              placeholder="+1 555 000 0000"
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
            />
          </div>

          {/* Owner */}
          <SearchDrop
            label="Owner User *"
            value={ownerId}
            display={selectedUser?.email ?? ''}
            options={users.map(u => ({ id: u.id, label: u.email, sub: u.userType }))}
            onSelect={setOwnerId}
            onClear={() => setOwnerId('')}
            placeholder="Search by email…"
          />

          {/* Divider */}
          <div className="pt-2 border-t border-border">
            <div className="text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-3">Platform Plan (optional)</div>

            <SearchDrop
              label={`${process.env.NEXT_PUBLIC_PLATFORM_NAME || 'Platform'} Plan`}
              value={planId}
              display={selectedPlan ? `${selectedPlan.name} — $${Number(selectedPlan.price).toFixed(2)}` : ''}
              options={plans.map(p => ({ id: p.id, label: p.name, sub: `$${Number(p.price).toFixed(2)}` }))}
              onSelect={setPlanId}
              onClear={() => setPlanId('')}
              placeholder="Search plans…"
            />

            {planId && (
              <div className="mt-3">
                <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1.5">Billing Cycle</label>
                <div className="flex gap-2">
                  {(['monthly', 'annual', 'one_time'] as const).map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setBillingCycle(c)}
                      className={cn(
                        'flex-1 py-2 font-mono text-[10px] tracking-[0.06em] uppercase rounded-md border transition-colors',
                        billingCycle === c
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-secondary text-muted-foreground border-border hover:bg-primary/10 hover:border-primary/30 hover:text-primary',
                      )}
                    >
                      {c.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={createTenant}
            disabled={saving}
            className="w-full mt-2 h-10 bg-primary text-primary-foreground font-mono text-[10px] tracking-[0.1em] uppercase rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Onboard Tenant'}
          </button>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {confirmTenant && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirmTenant(null)}>
          <div className="w-full max-w-md bg-card border border-destructive/30 rounded-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-[11px] font-mono tracking-[0.14em] uppercase text-destructive">Delete Tenant</h2>
              <button onClick={() => setConfirmTenant(null)} className="text-muted-foreground hover:text-foreground transition-colors"><CloseIcon /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-destructive/10 border border-destructive/25 rounded-md px-3 py-2.5">
                <p className="text-[12px] text-destructive font-semibold mb-1">This action cannot be undone.</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Deleting <span className="font-semibold text-foreground">{confirmTenant.name}</span> will permanently remove its tenant schema and every record inside it (devices, cards, customers, subscriptions, invoices, membership plans, access rules). System devices and cards previously assigned to this tenant will return to the unassigned pool. Access logs are retained for audit, with their tenant reference cleared.
                </p>
              </div>
              <div>
                <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1.5">
                  Type <span className="text-foreground">{confirmTenant.name}</span> to confirm
                </label>
                <input
                  autoFocus
                  value={confirmInput}
                  onChange={e => setConfirmInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmDelete()}
                  className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-[13px] text-foreground outline-none focus:border-destructive transition-colors"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setConfirmTenant(null)}
                  className="flex-1 h-10 bg-secondary text-foreground font-mono text-[10px] tracking-[0.1em] uppercase rounded-md hover:bg-secondary/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={busyId === confirmTenant.id || confirmInput.trim() !== confirmTenant.name}
                  className="flex-1 h-10 bg-destructive text-destructive-foreground font-mono text-[10px] tracking-[0.1em] uppercase rounded-md hover:bg-destructive/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busyId === confirmTenant.id ? 'Deleting…' : 'Delete Permanently'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TenantsPage;
