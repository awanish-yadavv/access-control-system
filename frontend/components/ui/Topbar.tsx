'use client';

import { useState, useEffect } from 'react';

const Topbar = () => {
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
        <div className="text-xs font-bold tracking-[0.04em] text-foreground">Dashboard</div>
        <div className="text-[10px] font-mono text-muted-foreground tracking-[0.06em]">
          <span className="text-primary">SYSTEM</span> / Overview
        </div>
      </div>

      <div className="ml-auto flex items-center gap-3.5">
        {/* Live indicator */}
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-accent tracking-[0.1em] uppercase">
          <span className="w-[7px] h-[7px] rounded-full bg-accent inline-block animate-[pulse-accent_2s_ease-in-out_infinite]" />
          MQTT LIVE
        </div>

        {/* Clock */}
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

export default Topbar;
