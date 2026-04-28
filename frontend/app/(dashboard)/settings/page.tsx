'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiGet, apiPatch } from '@/lib/api';
import toast from 'react-hot-toast';
import cn from '@/lib/cn';

interface SystemGstSettings {
  defaultRate: number;
  platformGstin: string | null;
  platformLegalName: string | null;
  platformAddress: string | null;
}

const GST_RATES = [0, 5, 12, 18, 28];

const FieldInput = ({
  label, value, onChange, placeholder = '',
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) => (
  <div>
    <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1.5">{label}</label>
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
    />
  </div>
);

const SystemSettingsPage = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  const [defaultRateStr, setDefaultRateStr]   = useState('18');
  const [platformGstin, setPlatformGstin]     = useState('');
  const [platformLegalName, setPlatformLegalName] = useState('');
  const [platformAddress, setPlatformAddress] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ gst: SystemGstSettings }>('/tenants/system/settings');
      const gst = res.data.gst ?? {};
      setDefaultRateStr(String(Number(gst.defaultRate) || 18));
      setPlatformGstin(gst.platformGstin ?? '');
      setPlatformLegalName(gst.platformLegalName ?? '');
      setPlatformAddress(gst.platformAddress ?? '');
    } catch { toast.error('Failed to load settings'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await apiPatch('/tenants/system/settings', {
        key: 'gst',
        value: {
          defaultRate: parseFloat(defaultRateStr) || 0,
          platformGstin:    platformGstin    || null,
          platformLegalName: platformLegalName || null,
          platformAddress:  platformAddress  || null,
        },
      });
      toast.success('System settings saved');
    } catch { toast.error('Failed to save settings'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="p-8 text-center font-mono text-[11px] text-muted-foreground">Loading…</div>;

  return (
    <div className="max-w-[640px]">
      <div className="mb-6">
        <h1 className="text-sm font-bold tracking-[0.04em] text-foreground uppercase">System Settings</h1>
        <p className="font-mono text-[10px] text-muted-foreground tracking-[0.06em] mt-1">
          Platform-wide configuration
        </p>
      </div>

      <div className="bg-card border border-border rounded-lg p-5 space-y-4 mb-6">
        <h2 className="text-[10px] font-mono tracking-[0.14em] uppercase text-muted-foreground">GST Configuration</h2>
        <p className="text-[11px] text-muted-foreground">
          The default GST rate is used as a fallback for tenants that have GST enabled but haven&apos;t set plan-level rates.
        </p>

        {/* Default rate — free input + presets */}
        <div>
          <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-2">Platform Default GST Rate (%)</label>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={defaultRateStr}
              onChange={e => setDefaultRateStr(e.target.value)}
              className="w-24 bg-secondary border border-border rounded-md px-3 py-2 text-[13px] font-mono text-foreground outline-none focus:border-primary transition-colors"
            />
            <span className="text-[13px] text-muted-foreground font-mono">%</span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {GST_RATES.map(rate => (
              <button
                key={rate}
                type="button"
                onClick={() => setDefaultRateStr(String(rate))}
                className={cn(
                  'px-3 py-1 rounded border font-mono text-[10px] transition-colors',
                  parseFloat(defaultRateStr) === rate
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-secondary text-muted-foreground border-border hover:border-primary/40',
                )}
              >
                {rate}%
              </button>
            ))}
          </div>
        </div>

        <FieldInput
          label="Platform GSTIN"
          value={platformGstin}
          onChange={v => setPlatformGstin(v.toUpperCase())}
          placeholder="22AAAAA0000A1Z5"
        />
        <FieldInput
          label="Platform Legal Name"
          value={platformLegalName}
          onChange={setPlatformLegalName}
          placeholder={`${process.env.NEXT_PUBLIC_PLATFORM_NAME || 'Platform'} Technologies Pvt Ltd`}
        />
        <div>
          <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1.5">Platform Address</label>
          <textarea
            value={platformAddress}
            onChange={e => setPlatformAddress(e.target.value)}
            placeholder="Street, City, PIN"
            rows={3}
            className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors resize-none"
          />
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="h-10 px-8 bg-primary text-primary-foreground font-mono text-[10px] tracking-[0.1em] uppercase rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save Settings'}
      </button>
    </div>
  );
};

export default SystemSettingsPage;
