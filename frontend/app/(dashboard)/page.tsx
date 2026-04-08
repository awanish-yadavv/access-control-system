'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { getSocket } from '@/lib/socket';
import { apiGet } from '@/lib/api';
import cn from '@/lib/cn';
import toast from 'react-hot-toast';

interface AccessEvent {
  id: string;
  cardUid: string;
  deviceId: string | null;
  tenantId: string | null;
  userId: string | null;
  result: 'granted' | 'denied';
  reason: string;
  traceId: string;
  timestamp: string;
}

interface Stats {
  totalDevices: number;
  onlineDevices: number;
  totalCards: number;
  eventsToday: number;
  totalTenants: number;
}

const StatCard = ({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) => (
  <div className="bg-card border border-border rounded-lg p-5 relative overflow-hidden">
    <div className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground mb-2.5">{label}</div>
    <div className={cn('font-mono text-[34px] font-semibold leading-none mb-2 tracking-tight', accent ? `text-[${accent}]` : 'text-foreground')}>
      {value}
    </div>
    {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
  </div>
);

const FeedEntry = ({ event }: { event: AccessEvent }) => {
  const granted = event.result === 'granted';
  return (
    <div className="grid [grid-template-columns:auto_1fr_auto_auto] items-center gap-3.5 px-5 py-3 border-b border-border last:border-0 animate-[slideIn_.35s_cubic-bezier(.22,1,.36,1)]">
      <div className={cn(
        'w-2 h-2 rounded-full shrink-0',
        granted ? 'bg-accent shadow-[0_0_6px_oklch(0.55_0.12_185/50%)]' : 'bg-destructive shadow-[0_0_6px_oklch(0.577_0.245_27.325/50%)]',
      )} />
      <div>
        <div className="font-mono text-[11px] font-medium text-foreground tracking-[0.04em]">{event.cardUid}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{event.reason} · {event.tenantId?.slice(0, 8) ?? 'unknown'}</div>
      </div>
      <div className="font-mono text-[10px] text-muted-foreground text-right">
        {new Date(event.timestamp).toLocaleTimeString()}
      </div>
      <span className={cn(
        'font-mono text-[9px] tracking-[0.1em] uppercase px-2 py-0.5 rounded-[3px] border',
        granted
          ? 'bg-accent/15 text-accent border-accent/25'
          : 'bg-destructive/12 text-destructive border-destructive/25',
      )}>
        {granted ? 'GRANTED' : 'DENIED'}
      </span>
    </div>
  );
};

const DashboardPage = () => {
  const { data: session } = useSession();
  const [events, setEvents] = useState<AccessEvent[]>([]);
  const [stats, setStats]   = useState<Stats>({ totalDevices: 0, onlineDevices: 0, totalCards: 0, eventsToday: 0, totalTenants: 0 });

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiGet<{ logs: AccessEvent[]; total: number }>('/access-logs?limit=20');
        setEvents(res.data.logs);
        setStats((s) => ({ ...s, eventsToday: res.data.total }));
      } catch { /* silently fail */ }
      try {
        const devRes = await apiGet<{ logs: never[]; total: number }>('/devices');
        const data = devRes.data as unknown as { total?: number } | never[];
        if (Array.isArray(data)) setStats((s) => ({ ...s, totalDevices: data.length }));
      } catch { /* silently fail */ }
    };
    load();
  }, []);

  useEffect(() => {
    if (!session?.accessToken) return;
    const socket = getSocket(session.accessToken);
    const handler = (event: AccessEvent) => {
      setEvents((prev) => [event, ...prev].slice(0, 50));
      setStats((s) => ({ ...s, eventsToday: s.eventsToday + 1 }));
      if (event.result === 'denied') toast.error(`Access denied — ${event.cardUid} · ${event.reason}`, { duration: 4000 });
    };
    socket.on('access_event', handler);
    return () => { socket.off('access_event', handler); };
  }, [session?.accessToken]);

  return (
    <>
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-10px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Access Events Today" value={stats.eventsToday.toLocaleString()} sub="Live counter"  accent="var(--primary)" />
        <StatCard label="Devices Online"      value={`${stats.onlineDevices}/${stats.totalDevices}`} sub="Total registered" accent="var(--accent)" />
        <StatCard label="Active RFID Cards"   value={stats.totalCards.toLocaleString()} />
        <StatCard label="Active Tenants"      value={stats.totalTenants} />
      </div>

      {/* Live feed */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2.5">
          <span className="text-[13px] font-bold tracking-[0.06em] uppercase text-foreground">Live Access Feed</span>
          <span className="font-mono text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full border border-border">
            {events.length} events
          </span>
          <div className="ml-auto flex items-center gap-1.5 font-mono text-[10px] text-accent tracking-[0.1em] uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block animate-[pulse-accent_2s_ease-in-out_infinite]" />
            LIVE
          </div>
        </div>
        <div className="max-h-[480px] overflow-y-auto">
          {events.length === 0 ? (
            <div className="p-10 text-center font-mono text-[11px] text-muted-foreground tracking-[0.08em]">
              WAITING FOR ACCESS EVENTS...
            </div>
          ) : (
            events.map((ev) => <FeedEntry key={ev.id} event={ev} />)
          )}
        </div>
      </div>
    </>
  );
};

export default DashboardPage;
