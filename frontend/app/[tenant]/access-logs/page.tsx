'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useParams } from 'next/navigation';
import { getSocket } from '@/lib/socket';
import { apiGet } from '@/lib/api';
import cn from '@/lib/cn';
import toast from 'react-hot-toast';
import DateTime from '@/components/ui/DateTime';

interface AccessLog {
  id: string;
  cardUid: string;
  deviceId: string | null;
  result: 'granted' | 'denied';
  reason: string;
  traceId: string;
  timestamp: string;
}

const TenantAccessLogsPage = () => {
  const { data: session } = useSession();
  const { tenant: tenantId } = useParams<{ tenant: string }>();
  const [logs, setLogs]       = useState<AccessLog[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<'all' | 'granted' | 'denied'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = filter !== 'all'
        ? `/access-logs?result=${filter}&limit=100`
        : '/access-logs?limit=100';
      const res = await apiGet<{ logs: AccessLog[]; total: number }>(url);
      setLogs(res.data.logs ?? []);
      setTotal(res.data.total ?? 0);
    } catch { toast.error('Failed to load access logs'); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!session?.accessToken) return;
    const socket = getSocket(session.accessToken);
    const handler = (event: AccessLog) => {
      setLogs((prev) => [event, ...prev].slice(0, 100));
      setTotal((t) => t + 1);
    };
    socket.on('access_event', handler);
    return () => { socket.off('access_event', handler); };
  }, [session?.accessToken, tenantId]);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-sm font-bold tracking-[0.04em] text-foreground uppercase">Access Logs</h1>
          <p className="font-mono text-[10px] text-muted-foreground tracking-[0.06em] mt-1">
            {total.toLocaleString()} total events · live stream
          </p>
        </div>
        <div className="flex gap-1">
          {(['all', 'granted', 'denied'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'font-mono text-[10px] tracking-[0.1em] uppercase px-3 py-1.5 rounded border cursor-pointer transition-colors',
                filter === f
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-muted-foreground border-border hover:border-primary/50',
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              {['Result', 'Card UID', 'Reason', 'Device', 'Trace ID', 'Time'].map((h) => (
                <th key={h} className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground px-4 py-2.5 text-left font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-10 text-center font-mono text-[11px] text-muted-foreground">Loading...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={6} className="p-10 text-center font-mono text-[11px] text-muted-foreground">No access events</td></tr>
            ) : logs.map((log) => {
              const granted = log.result === 'granted';
              return (
                <tr key={log.id} className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors">
                  <td className="px-4 py-2.5">
                    <span className={cn(
                      'font-mono text-[9px] tracking-[0.1em] uppercase px-2 py-0.5 rounded-[3px] border',
                      granted
                        ? 'bg-accent/15 text-accent border-accent/25'
                        : 'bg-destructive/12 text-destructive border-destructive/25',
                    )}>
                      {log.result}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-primary tracking-[0.06em]">{log.cardUid}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{log.reason}</td>
                  <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">{log.deviceId?.slice(0, 8) ?? '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-[9px] text-muted-foreground">{log.traceId?.slice(0, 12)}…</td>
                  <td className="px-4 py-2.5"><DateTime value={log.timestamp} format="datetime" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TenantAccessLogsPage;
