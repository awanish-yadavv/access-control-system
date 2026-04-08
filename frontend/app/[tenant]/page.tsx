'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useParams } from 'next/navigation';
import { getSocket } from '@/lib/socket';
import { apiGet } from '@/lib/api';
import cn from '@/lib/cn';
import toast from 'react-hot-toast';

interface AccessEvent {
  id: string;
  cardUid: string;
  deviceId: string | null;
  result: 'granted' | 'denied';
  reason: string;
  traceId: string;
  timestamp: string;
}

interface TenantDevice {
  device_id: string;
  name: string | null;
  status: string;
}

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
        <div className="text-[11px] text-muted-foreground mt-0.5">{event.reason}</div>
      </div>
      <div className="font-mono text-[10px] text-muted-foreground text-right">
        {new Date(event.timestamp).toLocaleTimeString()}
      </div>
      <span className={cn(
        'font-mono text-[9px] tracking-[0.1em] uppercase px-2 py-0.5 rounded-[3px] border',
        granted ? 'bg-accent/15 text-accent border-accent/25' : 'bg-destructive/12 text-destructive border-destructive/25',
      )}>
        {granted ? 'GRANTED' : 'DENIED'}
      </span>
    </div>
  );
};

const TenantDashboardPage = () => {
  const { data: session } = useSession();
  const params = useParams<{ tenant: string }>();
  const tenantId = params.tenant;

  const [events, setEvents]       = useState<AccessEvent[]>([]);
  const [devices, setDevices]     = useState<TenantDevice[]>([]);
  const [eventsToday, setEventsToday] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const logsRes = await apiGet<{ logs: AccessEvent[]; total: number }>('/access-logs?limit=20');
        setEvents(logsRes.data.logs ?? []);
        setEventsToday(logsRes.data.total ?? 0);
      } catch { /* silently fail */ }
      try {
        const devRes = await apiGet<TenantDevice[]>(`/tenants/${tenantId}/devices`);
        setDevices(Array.isArray(devRes.data) ? devRes.data : []);
      } catch { /* silently fail */ }
    };
    load();
  }, [tenantId]);

  useEffect(() => {
    if (!session?.accessToken) return;
    const socket = getSocket(session.accessToken);
    const handler = (event: AccessEvent) => {
      setEvents((prev) => [event, ...prev].slice(0, 50));
      setEventsToday((n) => n + 1);
      if (event.result === 'denied') {
        toast.error(`Denied — ${event.cardUid} · ${event.reason}`, { duration: 4000 });
      }
    };
    socket.on('access_event', handler);
    return () => { socket.off('access_event', handler); };
  }, [session?.accessToken]);

  const onlineDevices = devices.filter((d) => d.status === 'online').length;

  return (
    <>
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-10px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground mb-2.5">Access Events Today</div>
          <div className="font-mono text-[34px] font-semibold leading-none text-primary tracking-tight">{eventsToday.toLocaleString()}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground mb-2.5">Devices Online</div>
          <div className="font-mono text-[34px] font-semibold leading-none text-accent tracking-tight">{onlineDevices}/{devices.length}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-[9px] font-mono tracking-[0.18em] uppercase text-muted-foreground mb-2.5">Live Events Buffered</div>
          <div className="font-mono text-[34px] font-semibold leading-none text-foreground tracking-tight">{events.length}</div>
        </div>
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

export default TenantDashboardPage;
