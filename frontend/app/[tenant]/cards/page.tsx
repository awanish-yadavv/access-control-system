'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { apiGet, apiPatch, apiPut } from '@/lib/api';
import cn from '@/lib/cn';
import toast from 'react-hot-toast';
import DateTime from '@/components/ui/DateTime';

interface TenantCard {
  id: string;          // my_cards.id — used for assign/unassign
  card_id: string;     // system card id — used for block/unblock
  uid: string;
  label: string | null;
  card_status: string;
  customer_id: string | null;
  customer_email: string | null;
  issued_at: string;
}

interface Customer {
  user_id: string;
  email: string;
  name: string | null;
}

interface AccessDevice {
  id: string;           // my_devices.id
  device_id: string;
  label: string | null;
  mac_address: string;
  system_name: string | null;
  status: string;
  has_access: boolean;
}

// ── Shared atoms ──────────────────────────────────────────────────────────────

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

interface SearchDropProps {
  label: string;
  value: string;
  display: string;
  options: { id: string; label: string }[];
  onSelect: (id: string) => void;
  onClear?: () => void;
}

const SearchDrop = ({ label, value, display, options, onSelect, onClear }: SearchDropProps) => {
  const [open, setOpen] = useState(false);
  const [q, setQ]       = useState('');
  const filtered = options.filter(o => o.label.toLowerCase().includes(q.toLowerCase()));

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
            <span role="button" tabIndex={0}
              onClick={e => { e.stopPropagation(); onClear(); }}
              onKeyDown={e => e.key === 'Enter' && (e.stopPropagation(), onClear?.())}
              className="text-muted-foreground hover:text-foreground p-0.5"
            ><CloseIcon /></span>
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
              className="w-full bg-secondary rounded px-2.5 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0
              ? <div className="p-3 text-center font-mono text-[10px] text-muted-foreground">No results</div>
              : filtered.map(o => (
                <button key={o.id} type="button"
                  onClick={() => { onSelect(o.id); setOpen(false); }}
                  className={cn('w-full px-3 py-2 text-left hover:bg-secondary transition-colors', o.id === value && 'bg-accent/10')}
                >
                  <span className="text-[13px] text-foreground">{o.label}</span>
                </button>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

const TenantCardsPage = () => {
  const { tenant: tenantId } = useParams<{ tenant: string }>();
  const [cards, setCards]     = useState<TenantCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);

  // Assign panel
  const [assignCard, setAssignCard]     = useState<TenantCard | null>(null);
  const [customerId, setCustomerId]     = useState('');
  const [labelInput, setLabelInput]     = useState('');
  const [assignSaving, setAssignSaving] = useState(false);

  // Device access
  const [accessDevices, setAccessDevices]   = useState<AccessDevice[]>([]);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await apiGet<TenantCard[]>(`/tenants/${tenantId}/cards`);
      setCards(Array.isArray(res.data) ? res.data : []);
    } catch { toast.error('Failed to load cards'); }
    finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const loadCustomers = useCallback(async () => {
    if (customers.length > 0) return;
    try {
      const res = await apiGet<Customer[]>(`/tenants/${tenantId}/customers`);
      setCustomers(Array.isArray(res.data) ? res.data : []);
    } catch {}
  }, [customers.length, tenantId]);

  const openAssign = async (card: TenantCard) => {
    setAssignCard(card);
    setCustomerId(card.customer_id ?? '');
    setLabelInput(card.label ?? '');
    setAccessDevices([]);
    setSelectedDeviceIds(new Set());
    loadCustomers();
    try {
      const res = await apiGet<AccessDevice[]>(`/tenants/${tenantId}/cards/${card.id}/access-devices`);
      const devs = Array.isArray(res.data) ? res.data : [];
      setAccessDevices(devs);
      setSelectedDeviceIds(new Set(devs.filter(d => d.has_access).map(d => d.id)));
    } catch { /* silent — no devices is fine */ }
  };

  const saveAssign = async () => {
    if (!assignCard) return;
    setAssignSaving(true);
    try {
      await apiPatch(`/tenants/${tenantId}/cards/${assignCard.id}`, {
        customerId: customerId || null,
        label: labelInput || null,
      });
      await apiPut(`/tenants/${tenantId}/cards/${assignCard.id}/access-devices`, {
        deviceIds: Array.from(selectedDeviceIds),
      });
      toast.success('Card updated');
      setAssignCard(null);
      load();
    } catch { toast.error('Failed to update card'); }
    finally { setAssignSaving(false); }
  };

  const toggleDevice = (deviceId: string) => {
    setSelectedDeviceIds(prev => {
      const next = new Set(prev);
      if (next.has(deviceId)) next.delete(deviceId);
      else next.add(deviceId);
      return next;
    });
  };

  const unassign = async (card: TenantCard) => {
    try {
      await apiPatch(`/tenants/${tenantId}/cards/${card.id}`, { customerId: null });
      toast.success('Card unassigned');
      load();
    } catch { toast.error('Failed to unassign card'); }
  };

  const toggleBlock = async (card: TenantCard) => {
    const newStatus = card.card_status === 'active' ? 'inactive' : 'active';
    try {
      await apiPatch(`/cards/${card.card_id}`, { status: newStatus });
      toast.success(newStatus === 'active' ? 'Card unblocked' : 'Card blocked');
      load();
    } catch { toast.error('Failed to update card status'); }
  };

  const total      = cards.length;
  const assigned   = cards.filter(c => c.customer_id).length;
  const active     = cards.filter(c => c.card_status === 'active').length;
  const selectedCustomer = customers.find(u => u.user_id === customerId);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-sm font-bold tracking-[0.04em] text-foreground uppercase">RFID Cards</h1>
          <p className="font-mono text-[10px] text-muted-foreground tracking-[0.06em] mt-1">
            {total} total · {assigned} assigned · {active} active
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Total',      value: total },
          { label: 'Assigned',   value: assigned },
          { label: 'Unassigned', value: total - assigned },
          { label: 'Active',     value: active },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-lg p-4">
            <div className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground mb-1.5">{s.label}</div>
            <div className="text-2xl font-bold text-foreground">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              {['UID', 'Label', 'Assigned To', 'Status', 'Issued', 'Actions'].map(h => (
                <th key={h} className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground px-5 py-2.5 text-left font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-10 text-center font-mono text-[11px] text-muted-foreground">Loading...</td></tr>
            ) : cards.length === 0 ? (
              <tr><td colSpan={6} className="p-10 text-center font-mono text-[11px] text-muted-foreground">No cards issued to this tenant</td></tr>
            ) : cards.map(c => (
              <tr key={c.id} className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors group">
                <td className="px-5 py-3 font-mono text-xs text-primary tracking-[0.08em]">{c.uid}</td>
                <td className="px-5 py-3 text-[12px] text-muted-foreground">{c.label ?? '—'}</td>
                <td className="px-5 py-3 text-[12px] text-foreground">{c.customer_email ?? <span className="text-muted-foreground">Unassigned</span>}</td>
                <td className="px-5 py-3">
                  <span className={cn(
                    'font-mono text-[9px] tracking-[0.1em] uppercase px-2 py-0.5 rounded-[3px] border',
                    c.card_status === 'active'
                      ? 'bg-accent/15 text-accent border-accent/25'
                      : 'bg-destructive/12 text-destructive border-destructive/25',
                  )}>
                    {c.card_status ?? 'unknown'}
                  </span>
                </td>
                <td className="px-5 py-3"><DateTime value={c.issued_at} format="date" /></td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openAssign(c)}
                      className="font-mono text-[9px] tracking-[0.06em] uppercase px-2.5 py-1 bg-primary/10 border border-primary/30 text-primary rounded hover:bg-primary/20 transition-colors"
                    >
                      {c.customer_id ? 'Reassign' : 'Assign'}
                    </button>
                    {c.customer_id && (
                      <button
                        onClick={() => unassign(c)}
                        className="font-mono text-[9px] tracking-[0.06em] uppercase px-2.5 py-1 bg-muted border border-border text-muted-foreground rounded hover:bg-secondary transition-colors"
                      >
                        Unassign
                      </button>
                    )}
                    <button
                      onClick={() => toggleBlock(c)}
                      className={cn(
                        'font-mono text-[9px] tracking-[0.06em] uppercase px-2.5 py-1 rounded border transition-colors',
                        c.card_status === 'active'
                          ? 'bg-destructive/10 border-destructive/30 text-destructive hover:bg-destructive/20'
                          : 'bg-accent/10 border-accent/30 text-accent hover:bg-accent/20',
                      )}
                    >
                      {c.card_status === 'active' ? 'Block' : 'Unblock'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Assign panel */}
      {assignCard && <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setAssignCard(null)} />}
      <div className={cn(
        'fixed top-0 right-0 h-full w-[380px] z-50 bg-background border-l border-border shadow-2xl transition-transform duration-300',
        assignCard ? 'translate-x-0' : 'translate-x-full',
      )}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <h2 className="text-[11px] font-mono tracking-[0.14em] uppercase text-foreground">
            {assignCard?.customer_id ? 'Reassign Card' : 'Assign Card'}
          </h2>
          <button onClick={() => setAssignCard(null)} className="text-muted-foreground hover:text-foreground transition-colors"><CloseIcon /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {assignCard && (
            <div className="px-3 py-2.5 bg-secondary rounded-md font-mono text-[11px] text-primary tracking-[0.08em]">
              Card: {assignCard.uid}
            </div>
          )}
          <SearchDrop
            label="Customer"
            value={customerId}
            display={selectedCustomer ? (selectedCustomer.name ? `${selectedCustomer.name} (${selectedCustomer.email})` : selectedCustomer.email) : ''}
            options={customers.map(u => ({ id: u.user_id, label: u.name ? `${u.name} (${u.email})` : u.email }))}
            onSelect={setCustomerId}
            onClear={() => setCustomerId('')}
          />
          <div>
            <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1.5">Label (optional)</label>
            <input
              value={labelInput}
              onChange={e => setLabelInput(e.target.value)}
              placeholder="e.g. Main entrance"
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
            />
          </div>
          {/* Device access */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground">Device Access</label>
              {accessDevices.length > 0 && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => setSelectedDeviceIds(new Set(accessDevices.map(d => d.id)))}
                    className="font-mono text-[9px] text-primary hover:underline">All</button>
                  <button type="button" onClick={() => setSelectedDeviceIds(new Set())}
                    className="font-mono text-[9px] text-muted-foreground hover:underline">None</button>
                </div>
              )}
            </div>
            {accessDevices.length === 0 ? (
              <div className="px-3 py-3 bg-secondary rounded-md font-mono text-[10px] text-muted-foreground">
                No devices assigned to this tenant yet
              </div>
            ) : (
              <div className="bg-secondary rounded-md overflow-hidden divide-y divide-border">
                {accessDevices.map(d => (
                  <label key={d.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-border/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedDeviceIds.has(d.id)}
                      onChange={() => toggleDevice(d.id)}
                      className="accent-primary w-3.5 h-3.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] text-foreground font-medium truncate">
                        {d.label ?? d.system_name ?? d.mac_address}
                      </div>
                      <div className="font-mono text-[9px] text-muted-foreground">{d.mac_address}</div>
                    </div>
                    <span className={cn(
                      'font-mono text-[8px] tracking-[0.06em] uppercase px-1.5 py-0.5 rounded border',
                      d.status === 'online' ? 'text-accent border-accent/30' : 'text-muted-foreground border-border',
                    )}>{d.status}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={saveAssign}
            disabled={assignSaving}
            className="w-full h-10 bg-primary text-primary-foreground font-mono text-[10px] tracking-[0.1em] uppercase rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {assignSaving ? 'Saving…' : assignCard?.customer_id ? 'Reassign' : 'Assign Card'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TenantCardsPage;
