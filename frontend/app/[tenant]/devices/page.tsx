'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { apiGet, apiPatch } from '@/lib/api';
import cn from '@/lib/cn';
import toast from 'react-hot-toast';
import DateTime from '@/components/ui/DateTime';

interface TenantDevice {
  id: string;
  device_id: string;
  label: string | null;
  notes: string | null;
  assigned_at: string;
  mac_address: string;
  name: string | null;
  status: string;
  last_seen: string | null;
}

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

const TenantDevicesPage = () => {
  const { tenant: tenantId } = useParams<{ tenant: string }>();
  const [devices, setDevices] = useState<TenantDevice[]>([]);
  const [loading, setLoading] = useState(true);

  const [editDevice, setEditDevice] = useState<TenantDevice | null>(null);
  const [labelInput, setLabelInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [saving, setSaving]         = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<TenantDevice[]>(`/tenants/${tenantId}/devices`);
      setDevices(Array.isArray(res.data) ? res.data : []);
    } catch { toast.error('Failed to load devices'); }
    finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const openEdit = (d: TenantDevice) => {
    setEditDevice(d);
    setLabelInput(d.label ?? '');
    setNotesInput(d.notes ?? '');
  };

  const saveEdit = async () => {
    if (!editDevice) return;
    setSaving(true);
    try {
      await apiPatch(`/tenants/${tenantId}/devices/${editDevice.id}`, {
        label: labelInput.trim() || null,
        notes: notesInput.trim() || null,
      });
      toast.success('Device updated');
      setEditDevice(null);
      load();
    } catch { toast.error('Failed to update device'); }
    finally { setSaving(false); }
  };

  const online = devices.filter(d => d.status === 'online').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-sm font-bold tracking-[0.04em] text-foreground uppercase">My Devices</h1>
          <p className="font-mono text-[10px] text-muted-foreground tracking-[0.06em] mt-1">
            {devices.length} device{devices.length !== 1 ? 's' : ''} · {online} online
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground mb-1.5">Total</div>
          <div className="text-2xl font-bold text-foreground">{devices.length}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground mb-1.5">Online</div>
          <div className="text-2xl font-bold text-accent">{online}</div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              {['Label', 'MAC Address', 'Status', 'Last Seen', 'Assigned', 'Actions'].map(h => (
                <th key={h} className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground px-5 py-2.5 text-left font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-10 text-center font-mono text-[11px] text-muted-foreground">Loading...</td></tr>
            ) : devices.length === 0 ? (
              <tr><td colSpan={6} className="p-10 text-center font-mono text-[11px] text-muted-foreground">No devices assigned to this tenant</td></tr>
            ) : devices.map(d => (
              <tr key={d.id} className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors group">
                <td className="px-5 py-3">
                  <div className="text-[13px] font-semibold text-foreground">{d.label ?? <span className="text-muted-foreground font-normal italic text-[12px]">No label</span>}</div>
                  {d.name && <div className="font-mono text-[9px] text-muted-foreground mt-0.5">{d.name}</div>}
                </td>
                <td className="px-5 py-3 font-mono text-[11px] text-foreground tracking-[0.04em]">{d.mac_address}</td>
                <td className="px-5 py-3"><StatusBadge status={d.status} /></td>
                <td className="px-5 py-3"><DateTime value={d.last_seen} format="datetime" /></td>
                <td className="px-5 py-3"><DateTime value={d.assigned_at} format="datetime" /></td>
                <td className="px-5 py-3">
                  <button onClick={() => openEdit(d)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity font-mono text-[9px] tracking-[0.06em] uppercase px-2.5 py-1 bg-primary/10 border border-primary/30 text-primary rounded hover:bg-primary/20 transition-colors">
                    Rename
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editDevice && <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setEditDevice(null)} />}
      <div className={cn(
        'fixed top-0 right-0 h-full w-[380px] z-50 bg-background border-l border-border shadow-2xl transition-transform duration-300',
        editDevice ? 'translate-x-0' : 'translate-x-full',
      )}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <h2 className="text-[11px] font-mono tracking-[0.14em] uppercase text-foreground">Rename Device</h2>
          <button onClick={() => setEditDevice(null)} className="text-muted-foreground hover:text-foreground transition-colors"><CloseIcon /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {editDevice && (
            <div className="px-3 py-2.5 bg-secondary rounded-md font-mono text-[11px] text-primary tracking-[0.04em]">
              {editDevice.mac_address}
            </div>
          )}
          <div>
            <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1.5">Label</label>
            <input value={labelInput} onChange={e => setLabelInput(e.target.value)} placeholder="e.g. Main Entrance"
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors" />
          </div>
          <div>
            <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1.5">Notes (optional)</label>
            <textarea value={notesInput} onChange={e => setNotesInput(e.target.value)} placeholder="Location, notes…" rows={3}
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors resize-none" />
          </div>
          <button onClick={saveEdit} disabled={saving}
            className="w-full h-10 bg-primary text-primary-foreground font-mono text-[10px] tracking-[0.1em] uppercase rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TenantDevicesPage;
