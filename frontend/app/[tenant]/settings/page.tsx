'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { apiGet, apiPatch } from '@/lib/api';
import toast from 'react-hot-toast';
import cn from '@/lib/cn';

interface TenantSettings {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  gstEnabled: boolean;
  gstType: 'igst' | 'cgst_sgst';
  gstin: string | null;
  gstLegalName: string | null;
  gstPan: string | null;
  gstRate: number;
  gstAddress: string | null;
  gstState: string | null;
  gstStateCode: string | null;
}

const GST_PRESETS = [0, 5, 12, 18, 28];

const FieldInput = ({
  label, value, onChange, placeholder = '', required = false, maxLength,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; maxLength?: number;
}) => (
  <div>
    <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1.5">
      {label}{required && <span className="text-destructive ml-1">*</span>}
    </label>
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
    />
  </div>
);

const TenantSettingsPage = () => {
  const { tenant: tenantId } = useParams<{ tenant: string }>();

  const [data, setData]       = useState<TenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  const [gstEnabled, setGstEnabled]     = useState(false);
  const [gstType, setGstType]           = useState<'igst' | 'cgst_sgst'>('cgst_sgst');
  const [gstin, setGstin]               = useState('');
  const [gstLegalName, setGstLegalName] = useState('');
  const [gstPan, setGstPan]             = useState('');
  const [gstRateStr, setGstRateStr]     = useState('18');
  const [gstAddress, setGstAddress]     = useState('');
  const [gstState, setGstState]         = useState('');
  const [gstStateCode, setGstStateCode] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await apiGet<TenantSettings>(`/tenants/${tenantId}`);
      const t = res.data;
      setData(t);
      setGstEnabled(t.gstEnabled ?? false);
      setGstType(t.gstType ?? 'cgst_sgst');
      setGstin(t.gstin ?? '');
      setGstLegalName(t.gstLegalName ?? '');
      setGstPan(t.gstPan ?? '');
      setGstRateStr(String(Number(t.gstRate) || 18));
      setGstAddress(t.gstAddress ?? '');
      setGstState(t.gstState ?? '');
      setGstStateCode(t.gstStateCode ?? '');
    } catch { toast.error('Failed to load settings'); }
    finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const gstRate = parseFloat(gstRateStr) || 0;

  const save = async () => {
    if (gstEnabled) {
      if (!gstin) { toast.error('GSTIN is required when GST is enabled'); return; }
      if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
        toast.error('Invalid GSTIN format'); return;
      }
      if (isNaN(gstRate) || gstRate < 0 || gstRate > 100) {
        toast.error('GST rate must be between 0 and 100'); return;
      }
    }
    setSaving(true);
    try {
      await apiPatch(`/tenants/${tenantId}`, {
        gstEnabled,
        gstType,
        gstin:        gstin || null,
        gstLegalName: gstLegalName || null,
        gstPan:       gstPan || null,
        gstRate,
        gstAddress:   gstAddress || null,
        gstState:     gstState || null,
        gstStateCode: gstStateCode || null,
      });
      toast.success('Settings saved');
      load();
    } catch { toast.error('Failed to save settings'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="p-8 text-center font-mono text-[11px] text-muted-foreground">Loading…</div>;
  if (!data)   return null;

  const halfRate = gstRate / 2;

  return (
    <div className="max-w-[680px]">
      <div className="mb-6">
        <h1 className="text-sm font-bold tracking-[0.04em] text-foreground uppercase">Settings</h1>
        <p className="font-mono text-[10px] text-muted-foreground tracking-[0.06em] mt-1">
          GST billing configuration for {data.name}
        </p>
      </div>

      {/* GST toggle */}
      <div className={cn(
        'flex items-center justify-between p-4 rounded-lg border mb-6',
        gstEnabled ? 'bg-accent/8 border-accent/25' : 'bg-muted border-border',
      )}>
        <div>
          <p className={cn('font-mono text-[11px] font-bold tracking-[0.08em] uppercase', gstEnabled ? 'text-accent' : 'text-muted-foreground')}>
            GST Billing {gstEnabled ? 'Enabled' : 'Disabled'}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {gstEnabled
              ? 'All new invoices will include GST breakdown'
              : 'Enable to apply Indian GST on customer invoices'}
          </p>
        </div>
        <button
          onClick={() => setGstEnabled(!gstEnabled)}
          className={cn(
            'relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none',
            gstEnabled ? 'bg-accent' : 'bg-border',
          )}
        >
          <span className={cn(
            'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200',
            gstEnabled ? 'translate-x-5' : 'translate-x-0.5',
          )} />
        </button>
      </div>

      {gstEnabled && (
        <div className="bg-card border border-border rounded-lg p-5 space-y-5 mb-6">
          <h2 className="text-[10px] font-mono tracking-[0.14em] uppercase text-muted-foreground">Business GST Details</h2>

          <FieldInput
            label="GSTIN"
            value={gstin}
            onChange={v => setGstin(v.toUpperCase())}
            placeholder="22AAAAA0000A1Z5"
            required
            maxLength={15}
          />
          <p className="text-[10px] text-muted-foreground -mt-3 font-mono">15-character GST Identification Number</p>

          <div className="grid grid-cols-2 gap-4">
            <FieldInput label="Legal Business Name" value={gstLegalName} onChange={setGstLegalName} placeholder="ABC Fitness Pvt Ltd" />
            <FieldInput label="PAN" value={gstPan} onChange={v => setGstPan(v.toUpperCase())} placeholder="AAAAA0000A" maxLength={10} />
          </div>

          {/* GST Type — IGST vs CGST+SGST */}
          <div>
            <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-2">GST Type</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setGstType('cgst_sgst')}
                className={cn(
                  'p-3 rounded-lg border text-left transition-colors',
                  gstType === 'cgst_sgst' ? 'bg-primary/8 border-primary text-foreground' : 'bg-secondary border-border text-muted-foreground hover:border-primary/40',
                )}
              >
                <div className="font-mono text-[11px] font-bold mb-0.5">CGST + SGST</div>
                <div className="text-[10px]">Intra-state — split equally</div>
                {gstRate > 0 && (
                  <div className="font-mono text-[10px] mt-1 text-primary">
                    CGST {halfRate.toFixed(1)}% + SGST {halfRate.toFixed(1)}%
                  </div>
                )}
              </button>
              <button
                type="button"
                onClick={() => setGstType('igst')}
                className={cn(
                  'p-3 rounded-lg border text-left transition-colors',
                  gstType === 'igst' ? 'bg-primary/8 border-primary text-foreground' : 'bg-secondary border-border text-muted-foreground hover:border-primary/40',
                )}
              >
                <div className="font-mono text-[11px] font-bold mb-0.5">IGST</div>
                <div className="text-[10px]">Inter-state — single tax</div>
                {gstRate > 0 && (
                  <div className="font-mono text-[10px] mt-1 text-primary">
                    IGST {gstRate}%
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* GST Rate — free input + quick presets */}
          <div>
            <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-2">
              Default GST Rate (%) — fallback for plans without a specific rate
            </label>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={gstRateStr}
                onChange={e => setGstRateStr(e.target.value)}
                className="w-24 bg-secondary border border-border rounded-md px-3 py-2 text-[13px] font-mono text-foreground outline-none focus:border-primary transition-colors"
              />
              <span className="text-[13px] text-muted-foreground font-mono">%</span>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {GST_PRESETS.map(rate => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => setGstRateStr(String(rate))}
                  className={cn(
                    'px-3 py-1 rounded border font-mono text-[10px] transition-colors',
                    parseFloat(gstRateStr) === rate
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-secondary text-muted-foreground border-border hover:border-primary/40',
                  )}
                >
                  {rate}%
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[9px] font-mono tracking-[0.14em] uppercase text-muted-foreground mb-1.5">Business Address</label>
            <textarea
              value={gstAddress}
              onChange={e => setGstAddress(e.target.value)}
              placeholder="Street, City, PIN"
              rows={3}
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FieldInput label="State" value={gstState} onChange={setGstState} placeholder="Maharashtra" />
            <FieldInput label="State Code" value={gstStateCode} onChange={v => setGstStateCode(v.toUpperCase())} placeholder="27" maxLength={2} />
          </div>
        </div>
      )}

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

export default TenantSettingsPage;
