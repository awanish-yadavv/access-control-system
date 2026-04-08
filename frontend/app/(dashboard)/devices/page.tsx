'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';
import PermissionGuard from '@/components/auth/PermissionGuard';
import cn from '@/lib/cn';
import toast from 'react-hot-toast';
import DateTime from '@/components/ui/DateTime';

interface Device {
  id: string;
  macAddress: string;
  name: string | null;
  publicKey: string | null;
  status: 'online' | 'offline';
  lastSeen: string | null;
  createdAt: string;
  tenant: { id: string; name: string } | null;
}

interface TenantOption { id: string; name: string; }

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const StatusBadge = ({ status }: { status: string }) => (
  <span className={cn(
    'inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] uppercase px-2.5 py-0.5 rounded-full border',
    status === 'online' ? 'bg-accent/15 text-accent border-accent/20' : 'bg-muted text-muted-foreground border-border',
  )}>
    <span className="w-[5px] h-[5px] rounded-full bg-current" />
    {status}
  </span>
);

interface SearchDropProps {
  label: string; value: string; display: string;
  options: { id: string; label: string }[];
  onSelect: (id: string) => void; onClear?: () => void;
}
const SearchDrop = ({ label, value, display, options, onSelect, onClear }: SearchDropProps) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const filtered = options.filter(o => o.label.toLowerCase().includes(q.toLowerCase()));
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
                  className={cn('w-full px-3 py-2 text-left hover:bg-secondary transition-colors text-[13px] text-foreground', o.id === value && 'bg-accent/10')}>
                  {o.label}
                </button>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
};

const DevicesPage = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState<TenantOption[]>([]);

  const [regOpen, setRegOpen]     = useState(false);
  const [macInput, setMacInput]   = useState('');
  const [nameInput, setNameInput] = useState('');
  const [regSaving, setRegSaving] = useState(false);

  const [assignDevice, setAssignDevice]     = useState<Device | null>(null);
  const [assignTenantId, setAssignTenantId] = useState('');
  const [assignSaving, setAssignSaving]     = useState(false);

  const [deleteDevice, setDeleteDevice] = useState<Device | null>(null);

  const [editDevice, setEditDevice]       = useState<Device | null>(null);
  const [editName, setEditName]           = useState('');
  const [editPublicKey, setEditPublicKey] = useState('');
  const [editSaving, setEditSaving]       = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<Device[]>('/devices');
      setDevices(Array.isArray(res.data) ? res.data : []);
    } catch { toast.error('Failed to load devices'); }
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

  const registerDevice = async () => {
    if (!macInput.trim()) { toast.error('MAC address is required'); return; }
    setRegSaving(true);
    try {
      await apiPost('/devices', { macAddress: macInput.trim().toUpperCase(), name: nameInput.trim() || null });
      toast.success('Device registered');
      setRegOpen(false); setMacInput(''); setNameInput('');
      load();
    } catch { toast.error('Failed to register device'); }
    finally { setRegSaving(false); }
  };

  const issueToTenant = async () => {
    if (!assignDevice || !assignTenantId) { toast.error('Select a tenant'); return; }
    setAssignSaving(true);
    try {
      await apiPost(`/devices/${assignDevice.id}/assign`, { tenantId: assignTenantId });
      toast.success('Device assigned to tenant');
      setAssignDevice(null); setAssignTenantId('');
      load();
    } catch { toast.error('Failed to assign device'); }
    finally { setAssignSaving(false); }
  };

  const confirmDelete = async () => {
    if (!deleteDevice) return;
    try {
      await apiDelete(`/devices/${deleteDevice.id}`);
      toast.success('Device deleted');
      setDeleteDevice(null);
      load();
    } catch { toast.error('Failed to delete device'); }
  };

  const saveEdit = async () => {
    if (!editDevice) return;
    setEditSaving(true);
    try {
      await apiPatch(`/devices/${editDevice.id}`, {
        name: editName || null,
        publicKey: editPublicKey.trim() || null,
      });
      toast.success('Device updated');
      setEditDevice(null);
      load();
    } catch { toast.error('Failed to update device'); }
    finally { setEditSaving(false); }
  };

  const total    = devices.length;
  const assigned = devices.filter(d => d.tenant).length;
  const online   = devices.filter(d => d.status === 'online').length;
  const selectedTenant = tenants.find(t => t.id === assignTenantId);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-sm font-bold tracking-[0.04em] text-foreground uppercase">Devices</h1>
          <p className="font-mono text-[10px] text-muted-foreground tracking-[0.06em] mt-1">Hardware device registry</p>
        </div>
        <PermissionGuard entity="devices" action="create">
          <button onClick={() => { setRegOpen(true); setMacInput(''); setNameInput(''); }}
            className="bg-primary text-primary-foreground border-none rounded-md px-4 py-2 text-[13px] font-bold tracking-[0.06em] uppercase cursor-pointer hover:opacity-90 transition-opacity">
            + Register Device
          </button>
        </PermissionGuard>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-5">
        {[{ label: 'Total', value: total }, { label: 'Assigned', value: assigned },
          { label: 'Unassigned', value: total - assigned }, { label: 'Online', value: online }].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-lg p-4">
            <div className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground mb-1.5">{s.label}</div>
            <div className="text-2xl font-bold text-foreground">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              {['MAC Address', 'Name', 'Key', 'Tenant', 'Status', 'Last Seen', 'Created', 'Actions'].map(h => (
                <th key={h} className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground px-5 py-2.5 text-left font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="p-10 text-center font-mono text-[11px] text-muted-foreground">Loading...</td></tr>
            ) : devices.length === 0 ? (
              <tr><td colSpan={8} className="p-10 text-center font-mono text-[11px] text-muted-foreground">No devices registered</td></tr>
            ) : devices.map(d => (
              <tr key={d.id} className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors group">
                <td className="px-5 py-3 font-mono text-[11px] text-foreground tracking-[0.04em]">{d.macAddress}</td>
                <td className="px-5 py-3 text-[13px] text-muted-foreground">{d.name ?? '—'}</td>
                <td className="px-5 py-3">
                  {d.publicKey
                    ? <span title="RSA public key registered" className="inline-flex items-center gap-1 font-mono text-[9px] text-green-400"><span className="w-[5px] h-[5px] rounded-full bg-green-400" />Registered</span>
                    : <span title="No public key — device cannot communicate securely" className="inline-flex items-center gap-1 font-mono text-[9px] text-yellow-400"><span className="w-[5px] h-[5px] rounded-full bg-yellow-400" />Pending</span>
                  }
                </td>
                <td className="px-5 py-3 text-[13px] text-foreground">
                  {d.tenant?.name ?? <span className="font-mono text-[10px] text-muted-foreground">Unassigned</span>}
                </td>
                <td className="px-5 py-3"><StatusBadge status={d.status} /></td>
                <td className="px-5 py-3"><DateTime value={d.lastSeen} format="datetime" /></td>
                <td className="px-5 py-3"><DateTime value={d.createdAt} format="datetime" /></td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <PermissionGuard entity="devices" action="update">
                      <button onClick={() => { setEditDevice(d); setEditName(d.name ?? ''); setEditPublicKey(d.publicKey ?? ''); }}
                        className="font-mono text-[9px] tracking-[0.06em] uppercase px-2.5 py-1 bg-muted border border-border text-muted-foreground rounded hover:bg-secondary transition-colors">
                        Edit
                      </button>
                    </PermissionGuard>
                    {!d.tenant && (
                      <PermissionGuard entity="devices" action="manage">
                        <button onClick={() => { setAssignDevice(d); setAssignTenantId(''); loadTenants(); }}
                          className="font-mono text-[9px] tracking-[0.06em] uppercase px-2.5 py-1 bg-primary/10 border border-primary/30 text-primary rounded hover:bg-primary/20 transition-colors">
                          Assign
                        </button>
                      </PermissionGuard>
                    )}
                    <PermissionGuard entity="devices" action="delete">
                      <button onClick={() => setDeleteDevice(d)}
                        className="font-mono text-[9px] tracking-[0.06em] uppercase px-2.5 py-1 bg-muted border border-border text-muted-foreground rounded hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive transition-colors">
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

      {regOpen && <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setRegOpen(false)} />}
      <div className={cn('fixed top-0 right-0 h-full w-[380px] z-50 bg-background border-l border-border shadow-2xl transition-transform duration-300', regOpen ? 'translate-x-0' : 'translate-x-full')}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <h2 className="text-[11px] font-mono tracking-[0.14em] uppercase text-foreground">Register Device</h2>
          <button onClick={() => setRegOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors"><CloseIcon /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1.5">MAC Address *</label>
            <input value={macInput} onChange={e => setMacInput(e.target.value)} placeholder="AA:BB:CC:DD:EE:FF"
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-[13px] font-mono text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors" />
          </div>
          <div>
            <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1.5">Name (optional)</label>
            <input value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder="Main Entrance"
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors" />
          </div>
          <button onClick={registerDevice} disabled={regSaving}
            className="w-full h-10 bg-primary text-primary-foreground font-mono text-[10px] tracking-[0.1em] uppercase rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50">
            {regSaving ? 'Registering…' : 'Register Device'}
          </button>
        </div>
      </div>

      {assignDevice && <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setAssignDevice(null)} />}
      <div className={cn('fixed top-0 right-0 h-full w-[380px] z-50 bg-background border-l border-border shadow-2xl transition-transform duration-300', assignDevice ? 'translate-x-0' : 'translate-x-full')}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <h2 className="text-[11px] font-mono tracking-[0.14em] uppercase text-foreground">Assign to Tenant</h2>
          <button onClick={() => setAssignDevice(null)} className="text-muted-foreground hover:text-foreground transition-colors"><CloseIcon /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {assignDevice && (
            <div className="px-3 py-2.5 bg-secondary rounded-md font-mono text-[11px] text-primary tracking-[0.04em]">
              {assignDevice.macAddress}{assignDevice.name && ` — ${assignDevice.name}`}
            </div>
          )}
          <SearchDrop label="Tenant *" value={assignTenantId} display={selectedTenant?.name ?? ''}
            options={tenants.map(t => ({ id: t.id, label: t.name }))}
            onSelect={setAssignTenantId} onClear={() => setAssignTenantId('')} />
          <button onClick={issueToTenant} disabled={assignSaving || !assignTenantId}
            className="w-full h-10 bg-primary text-primary-foreground font-mono text-[10px] tracking-[0.1em] uppercase rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50">
            {assignSaving ? 'Assigning…' : 'Assign Device'}
          </button>
        </div>
      </div>

      {deleteDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-xl p-6 w-[320px] shadow-2xl">
            <div className="text-[13px] font-bold text-foreground mb-1">Delete Device?</div>
            <div className="font-mono text-[11px] text-primary mb-1">{deleteDevice.macAddress}</div>
            <div className="font-mono text-[10px] text-muted-foreground mb-5">This will remove the device from the system permanently.</div>
            <div className="flex gap-2">
              <button onClick={() => setDeleteDevice(null)} className="flex-1 h-9 bg-secondary border border-border rounded-md font-mono text-[10px] uppercase text-muted-foreground hover:bg-primary/10 transition-colors">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 h-9 bg-destructive text-white rounded-md font-mono text-[10px] uppercase hover:bg-destructive/90 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

      {editDevice && <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setEditDevice(null)} />}
      <div className={cn('fixed top-0 right-0 h-full w-[420px] z-50 bg-background border-l border-border shadow-2xl transition-transform duration-300', editDevice ? 'translate-x-0' : 'translate-x-full')}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <h2 className="text-[11px] font-mono tracking-[0.14em] uppercase text-foreground">Edit Device</h2>
          <button onClick={() => setEditDevice(null)} className="text-muted-foreground hover:text-foreground transition-colors"><CloseIcon /></button>
        </div>
        <div className="px-6 py-5 space-y-4 overflow-y-auto h-[calc(100%-65px)]">
          {editDevice && (
            <div className="px-3 py-2.5 bg-secondary rounded-md font-mono text-[11px] text-primary tracking-[0.04em]">
              {editDevice.macAddress}
            </div>
          )}
          <div>
            <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1.5">Name</label>
            <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Main Entrance"
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors" />
          </div>
          <div>
            <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1.5">
              RSA Public Key
              <span className="ml-1.5 normal-case text-[9px] text-muted-foreground/70">(paste from device web dashboard)</span>
            </label>
            <textarea
              value={editPublicKey}
              onChange={e => setEditPublicKey(e.target.value)}
              placeholder={'-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----'}
              rows={8}
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-[11px] font-mono text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary transition-colors resize-none"
            />
            <p className="mt-1 text-[9px] font-mono text-muted-foreground">
              Open <span className="text-primary">http://&lt;device-ip&gt;/</span> → Crypto / Registration → Show &amp; copy to admin panel
            </p>
            {editDevice?.publicKey && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="w-[5px] h-[5px] rounded-full bg-green-400" />
                <span className="font-mono text-[9px] text-green-400">Key registered</span>
              </div>
            )}
            {editDevice && !editDevice.publicKey && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="w-[5px] h-[5px] rounded-full bg-yellow-400" />
                <span className="font-mono text-[9px] text-yellow-400">No key registered — encrypted scans will be rejected</span>
              </div>
            )}
          </div>
          <button onClick={saveEdit} disabled={editSaving}
            className="w-full h-10 bg-primary text-primary-foreground font-mono text-[10px] tracking-[0.1em] uppercase rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50">
            {editSaving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DevicesPage;
