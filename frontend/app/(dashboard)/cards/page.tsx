'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';
import PermissionGuard from '@/components/auth/PermissionGuard';
import cn from '@/lib/cn';
import toast from 'react-hot-toast';
import DateTime from '@/components/ui/DateTime';

interface Card {
  id: string;
  uid: string;
  status: 'active' | 'inactive';
  createdAt: string;
  tenant: { id: string; name: string } | null;
}

interface TenantOption {
  id: string;
  name: string;
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
  options: { id: string; label: string; sub?: string }[];
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
                  className={cn('w-full flex items-center justify-between px-3 py-2 text-left hover:bg-secondary transition-colors', o.id === value && 'bg-accent/10')}
                >
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

// ── Page ──────────────────────────────────────────────────────────────────────

const CardsPage = () => {
  const [cards, setCards]     = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState<TenantOption[]>([]);

  // Register panel
  const [regOpen, setRegOpen]   = useState(false);
  const [uidInput, setUidInput] = useState('');
  const [regSaving, setRegSaving] = useState(false);

  // Issue panel
  const [issueCard, setIssueCard]   = useState<Card | null>(null);
  const [issueTenantId, setIssueTenantId] = useState('');
  const [issueSaving, setIssueSaving]     = useState(false);

  // Delete confirm
  const [deleteCard, setDeleteCard] = useState<Card | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<Card[]>('/cards');
      setCards(Array.isArray(res.data) ? res.data : []);
    } catch { toast.error('Failed to load cards'); }
    finally { setLoading(false); }
  }, []);

  const loadTenants = useCallback(async () => {
    if (tenants.length > 0) return;
    try {
      const res = await apiGet<TenantOption[]>('/tenants');
      setTenants(Array.isArray(res.data) ? res.data : []);
    } catch {}
  }, [tenants.length]);

  useEffect(() => { load(); }, [load]);

  const registerCard = async () => {
    if (!uidInput.trim()) { toast.error('UID is required'); return; }
    setRegSaving(true);
    try {
      await apiPost('/cards', { uid: uidInput.trim().toUpperCase() });
      toast.success('Card registered');
      setRegOpen(false); setUidInput('');
      load();
    } catch { toast.error('Failed to register card'); }
    finally { setRegSaving(false); }
  };

  const issueToTenant = async () => {
    if (!issueCard || !issueTenantId) { toast.error('Select a tenant'); return; }
    setIssueSaving(true);
    try {
      await apiPost(`/cards/${issueCard.id}/assign`, { tenantId: issueTenantId });
      toast.success('Card issued to tenant');
      setIssueCard(null); setIssueTenantId('');
      load();
    } catch { toast.error('Failed to issue card'); }
    finally { setIssueSaving(false); }
  };

  const toggleStatus = async (card: Card) => {
    try {
      await apiPatch(`/cards/${card.id}`, { status: card.status === 'active' ? 'inactive' : 'active' });
      toast.success(card.status === 'active' ? 'Card blocked' : 'Card unblocked');
      load();
    } catch { toast.error('Failed to update card'); }
  };

  const confirmDelete = async () => {
    if (!deleteCard) return;
    try {
      await apiDelete(`/cards/${deleteCard.id}`);
      toast.success('Card deleted');
      setDeleteCard(null);
      load();
    } catch { toast.error('Failed to delete card'); }
  };

  const total    = cards.length;
  const issued   = cards.filter(c => c.tenant).length;
  const active   = cards.filter(c => c.status === 'active').length;
  const selectedTenant = tenants.find(t => t.id === issueTenantId);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-sm font-bold tracking-[0.04em] text-foreground uppercase">RFID Cards</h1>
          <p className="font-mono text-[10px] text-muted-foreground tracking-[0.06em] mt-1">Card registry and issuance</p>
        </div>
        <PermissionGuard entity="cards" action="create">
          <button
            onClick={() => { setRegOpen(true); setUidInput(''); }}
            className="bg-primary text-primary-foreground border-none rounded-md px-4 py-2 text-[13px] font-bold tracking-[0.06em] uppercase cursor-pointer hover:opacity-90 transition-opacity"
          >
            + Register Card
          </button>
        </PermissionGuard>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Total', value: total },
          { label: 'Issued', value: issued },
          { label: 'Unissued', value: total - issued },
          { label: 'Active', value: active },
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
              {['UID', 'Tenant', 'Status', 'Registered', 'Actions'].map(h => (
                <th key={h} className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground px-5 py-2.5 text-left font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="p-10 text-center font-mono text-[11px] text-muted-foreground">Loading...</td></tr>
            ) : cards.length === 0 ? (
              <tr><td colSpan={5} className="p-10 text-center font-mono text-[11px] text-muted-foreground">No cards registered</td></tr>
            ) : cards.map(c => (
              <tr key={c.id} className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors group">
                <td className="px-5 py-3 font-mono text-xs text-primary tracking-[0.08em]">{c.uid}</td>
                <td className="px-5 py-3 text-[13px] text-foreground">{c.tenant?.name ?? <span className="font-mono text-[10px] text-muted-foreground">Unissued</span>}</td>
                <td className="px-5 py-3">
                  <span className={cn(
                    'font-mono text-[9px] tracking-[0.1em] uppercase px-2 py-0.5 rounded-[3px] border',
                    c.status === 'active'
                      ? 'bg-accent/15 text-accent border-accent/25'
                      : 'bg-destructive/12 text-destructive border-destructive/25',
                  )}>
                    {c.status}
                  </span>
                </td>
                <td className="px-5 py-3"><DateTime value={c.createdAt} format="datetime" /></td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!c.tenant && (
                      <PermissionGuard entity="cards" action="manage">
                        <button
                          onClick={() => { setIssueCard(c); setIssueTenantId(''); loadTenants(); }}
                          className="font-mono text-[9px] tracking-[0.06em] uppercase px-2.5 py-1 bg-primary/10 border border-primary/30 text-primary rounded hover:bg-primary/20 transition-colors"
                        >
                          Issue
                        </button>
                      </PermissionGuard>
                    )}
                    <PermissionGuard entity="cards" action="update">
                      <button
                        onClick={() => toggleStatus(c)}
                        className={cn(
                          'font-mono text-[9px] tracking-[0.06em] uppercase px-2.5 py-1 rounded border transition-colors',
                          c.status === 'active'
                            ? 'bg-destructive/10 border-destructive/30 text-destructive hover:bg-destructive/20'
                            : 'bg-accent/10 border-accent/30 text-accent hover:bg-accent/20',
                        )}
                      >
                        {c.status === 'active' ? 'Block' : 'Unblock'}
                      </button>
                    </PermissionGuard>
                    <PermissionGuard entity="cards" action="delete">
                      <button
                        onClick={() => setDeleteCard(c)}
                        className="font-mono text-[9px] tracking-[0.06em] uppercase px-2.5 py-1 bg-muted border border-border text-muted-foreground rounded hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive transition-colors"
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

      {/* Register card panel */}
      {regOpen && <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setRegOpen(false)} />}
      <div className={cn(
        'fixed top-0 right-0 h-full w-[360px] z-50 bg-background border-l border-border shadow-2xl transition-transform duration-300',
        regOpen ? 'translate-x-0' : 'translate-x-full',
      )}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <h2 className="text-[11px] font-mono tracking-[0.14em] uppercase text-foreground">Register Card</h2>
          <button onClick={() => setRegOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors"><CloseIcon /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1.5">Card UID *</label>
            <input
              value={uidInput}
              onChange={e => setUidInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && registerCard()}
              placeholder="A3F29C01"
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-[13px] font-mono text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
            />
            <p className="mt-1.5 font-mono text-[9px] text-muted-foreground">Hex string from the RFID card. Will be uppercased automatically.</p>
          </div>
          <button
            onClick={registerCard}
            disabled={regSaving}
            className="w-full h-10 bg-primary text-primary-foreground font-mono text-[10px] tracking-[0.1em] uppercase rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {regSaving ? 'Registering…' : 'Register Card'}
          </button>
        </div>
      </div>

      {/* Issue to tenant panel */}
      {issueCard && <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setIssueCard(null)} />}
      <div className={cn(
        'fixed top-0 right-0 h-full w-[380px] z-50 bg-background border-l border-border shadow-2xl transition-transform duration-300',
        issueCard ? 'translate-x-0' : 'translate-x-full',
      )}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <h2 className="text-[11px] font-mono tracking-[0.14em] uppercase text-foreground">Issue Card to Tenant</h2>
          <button onClick={() => setIssueCard(null)} className="text-muted-foreground hover:text-foreground transition-colors"><CloseIcon /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {issueCard && (
            <div className="px-3 py-2.5 bg-secondary rounded-md font-mono text-[11px] text-primary tracking-[0.08em]">
              Card: {issueCard.uid}
            </div>
          )}
          <SearchDrop
            label="Tenant *"
            value={issueTenantId}
            display={selectedTenant?.name ?? ''}
            options={tenants.map(t => ({ id: t.id, label: t.name }))}
            onSelect={setIssueTenantId}
            onClear={() => setIssueTenantId('')}
          />
          <button
            onClick={issueToTenant}
            disabled={issueSaving || !issueTenantId}
            className="w-full h-10 bg-primary text-primary-foreground font-mono text-[10px] tracking-[0.1em] uppercase rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {issueSaving ? 'Issuing…' : 'Issue Card'}
          </button>
        </div>
      </div>

      {/* Delete confirm */}
      {deleteCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-xl p-6 w-[320px] shadow-2xl">
            <div className="text-[13px] font-bold text-foreground mb-1">Delete Card?</div>
            <div className="font-mono text-[11px] text-primary mb-1">{deleteCard.uid}</div>
            <div className="font-mono text-[10px] text-muted-foreground mb-5">This cannot be undone. The card will be removed from the system.</div>
            <div className="flex gap-2">
              <button onClick={() => setDeleteCard(null)} className="flex-1 h-9 bg-secondary border border-border rounded-md font-mono text-[10px] uppercase text-muted-foreground hover:bg-primary/10 transition-colors">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 h-9 bg-destructive text-white rounded-md font-mono text-[10px] uppercase hover:bg-destructive/90 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CardsPage;
