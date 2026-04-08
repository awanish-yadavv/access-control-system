'use client';

import { useState, useEffect } from 'react';

interface TenantTopbarProps {
  tenantName: string;
  tenantStatus: 'active' | 'suspended' | 'inactive';
  pageTitle?: string;
}

const STATUS_STYLES = {
  active:    'bg-accent/15 text-accent border-accent/25',
  suspended: 'bg-destructive/12 text-destructive border-destructive/25',
  inactive:  'bg-muted text-muted-foreground border-border',
};

const TenantTopbar = ({ tenantName, tenantStatus, pageTitle }: TenantTopbarProps) => {
  const [time, setTime] = useState('');

  useEffect(() => {
    const update = () => setTime(new Date().toTimeString().slice(0, 8));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="[grid-area:header] border-b border-border bg-card flex items-center px-7 gap-4">
      <div>
        <div className="text-xs font-bold tracking-[0.04em] text-foreground">
          {pageTitle ?? 'Dashboard'}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] font-mono text-primary tracking-[0.06em] uppercase">{tenantName}</span>
          <span className={`font-mono text-[8px] tracking-[0.1em] uppercase px-1.5 py-px rounded-[3px] border ${STATUS_STYLES[tenantStatus]}`}>
            {tenantStatus}
          </span>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-3.5">
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-accent tracking-[0.1em] uppercase">
          <span className="w-[7px] h-[7px] rounded-full bg-accent inline-block animate-[pulse-accent_2s_ease-in-out_infinite]" />
          LIVE
        </div>
        <div className="font-mono text-[11px] text-muted-foreground tracking-[0.08em] bg-secondary px-2.5 py-1 rounded border border-border min-w-[80px] text-center">
          {time}
        </div>
      </div>

      <style>{`
        @keyframes pulse-accent {
          0%, 100% { box-shadow: 0 0 0 0 oklch(0.55 0.12 185 / 60%); }
          50%       { box-shadow: 0 0 0 5px transparent; }
        }
      `}</style>
    </header>
  );
};

export default TenantTopbar;
