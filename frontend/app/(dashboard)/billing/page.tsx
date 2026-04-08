'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';
import PermissionGuard from '@/components/auth/PermissionGuard';
import cn from '@/lib/cn';
import toast from 'react-hot-toast';
import DateTime from '@/components/ui/DateTime';

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface Plan { id: string; name: string; price: number; features: Record<string,string>; createdAt: string; }
interface Tenant { id: string; name: string; status: string; }
interface TenantSub {
  id: string; tenantId: string; tenantName: string;
  plan_name: string; plan_price: number;
  status: string; billing_cycle: string;
  starts_at: string; expires_at: string | null; created_at: string;
}
interface TenantInv {
  id: string; tenantId: string; tenantName: string;
  subscription_id: string | null; amount: number;
  description: string | null; status: string;
  due_date: string | null; paid_at: string | null; created_at: string;
}

/* ── Shared atoms ───────────────────────────────────────────────────────────── */

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 1l12 12M13 1L1 13"/></svg>
);

const SUB_BADGE: Record<string,string> = {
  active:    'bg-accent/15 text-accent border-accent/25',
  expired:   'bg-destructive/12 text-destructive border-destructive/25',
  cancelled: 'bg-muted text-muted-foreground border-border',
};
const INV_BADGE: Record<string,string> = {
  paid:   'bg-accent/15 text-accent border-accent/25',
  unpaid: 'bg-destructive/12 text-destructive border-destructive/25',
  void:   'bg-muted text-muted-foreground border-border',
};

/* ── FeaturesBuilder ────────────────────────────────────────────────────────── */

interface FeatureRow { key: string; value: string; }
const FeaturesBuilder = ({ rows, onChange }: { rows: FeatureRow[]; onChange: (r: FeatureRow[]) => void }) => {
  const upd = (i: number, f: 'key'|'value', v: string) => onChange(rows.map((r,idx)=>idx===i?{...r,[f]:v}:r));
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row,i)=>(
        <div key={i} className="flex gap-2 items-center">
          <input value={row.key} onChange={e=>upd(i,'key',e.target.value)} placeholder="Name"
            className="flex-1 bg-secondary border border-border rounded px-2.5 py-1.5 font-mono text-[11px] text-foreground outline-none focus:border-primary transition-colors"/>
          <input value={row.value} onChange={e=>upd(i,'value',e.target.value)} placeholder="Value"
            className="flex-1 bg-secondary border border-border rounded px-2.5 py-1.5 font-mono text-[11px] text-foreground outline-none focus:border-primary transition-colors"/>
          <button type="button" onClick={()=>onChange(rows.filter((_,idx)=>idx!==i))}
            className="p-1.5 text-muted-foreground hover:text-destructive transition-colors">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 1l9 9M10 1L1 10"/></svg>
          </button>
        </div>
      ))}
      <button type="button" onClick={()=>onChange([...rows,{key:'',value:''}])}
        className="font-mono text-[9px] tracking-[0.1em] uppercase text-primary hover:opacity-70 transition-opacity mt-1 w-fit">
        + Add Feature
      </button>
    </div>
  );
};

/* ── SearchableDropdown ─────────────────────────────────────────────────────── */

interface DropdownOption { value: string; label: string; sub?: string; }
const SearchableDropdown = ({ options, value, onChange, placeholder }: {
  options: DropdownOption[]; value: string; onChange: (v:string)=>void; placeholder: string;
}) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const selected = options.find(o=>o.value===value);
  const filtered = options.filter(o=>o.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="relative">
      <button type="button" onClick={()=>setOpen(!open)}
        className={cn('w-full bg-secondary border rounded px-3 py-2 text-left font-mono text-[11px] flex items-center justify-between gap-2 transition-colors',
          open?'border-primary':'border-border hover:border-primary/50')}>
        <span className={selected?'text-foreground':'text-muted-foreground'}>{selected?.label??placeholder}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"
          className={cn('shrink-0 text-muted-foreground transition-transform',open?'rotate-180':'')}><path d="M2 3.5l3 3 3-3"/></svg>
      </button>
      {open&&(
        <div className="absolute top-full left-0 mt-1 w-full bg-card border border-border rounded-lg shadow-xl z-30 overflow-hidden">
          <div className="p-2 border-b border-border">
            <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Search…"
              className="w-full bg-secondary border border-border rounded px-2.5 py-1.5 font-mono text-[11px] text-foreground outline-none focus:border-primary transition-colors"/>
          </div>
          <div className="max-h-[180px] overflow-y-auto">
            {filtered.length===0?(
              <div className="px-3 py-3 font-mono text-[10px] text-muted-foreground text-center">No results</div>
            ):filtered.map(o=>(
              <button key={o.value} type="button"
                onClick={()=>{onChange(o.value);setOpen(false);setQ('');}}
                className={cn('w-full px-3 py-2.5 text-left flex items-center justify-between hover:bg-secondary/70 transition-colors',
                  value===o.value&&'bg-primary/10')}>
                <span className="font-mono text-[11px] text-foreground">{o.label}</span>
                {o.sub&&<span className="font-mono text-[9px] text-muted-foreground">{o.sub}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   TAB 1: Plans
══════════════════════════════════════════════════════════════════════════════ */

const PlanForm = ({ initial, onClose, onSaved }: { initial?: Plan; onClose:()=>void; onSaved:()=>void }) => {
  const isEdit = !!initial;
  const [name, setName]   = useState(initial?.name??'');
  const [price, setPrice] = useState(initial?.price?.toString()??'');
  const [rows, setRows]   = useState<FeatureRow[]>(
    initial?.features ? Object.entries(initial.features).map(([key,value])=>({key,value:String(value)})) : [],
  );
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim())   { toast.error('Plan name required'); return; }
    if (!price||isNaN(Number(price))||Number(price)<0) { toast.error('Valid price required'); return; }
    const features: Record<string,string> = {};
    rows.forEach(r=>{ if(r.key.trim()) features[r.key.trim()]=r.value; });
    setSaving(true);
    try {
      const body = { name, price: Number(price), features };
      isEdit ? await apiPatch(`/plans/${initial!.id}`,body) : await apiPost('/plans',body);
      toast.success(isEdit?'Plan updated':'Plan created');
      onSaved();
    } catch { toast.error('Operation failed'); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/30"/>
      <div className="w-[420px] bg-background border-l border-border flex flex-col shadow-2xl" onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <div className="text-sm font-bold tracking-[0.04em] uppercase">{isEdit?'Edit Plan':'Create Plan'}</div>
            <div className="font-mono text-[10px] text-muted-foreground mt-0.5">{isEdit?initial!.name:'New pricing tier'}</div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1"><CloseIcon/></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
          <div>
            <label className="block font-mono text-[9px] text-muted-foreground tracking-[0.14em] uppercase mb-1.5">Plan Name</label>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Starter, Pro, Enterprise"
              className="w-full bg-secondary border border-border rounded px-3 py-2 text-foreground text-sm outline-none focus:border-primary transition-colors"/>
          </div>
          <div>
            <label className="block font-mono text-[9px] text-muted-foreground tracking-[0.14em] uppercase mb-1.5">Monthly Price (USD)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[13px] text-muted-foreground">$</span>
              <input type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} placeholder="0.00"
                className="w-full bg-secondary border border-border rounded pl-7 pr-3 py-2 text-foreground font-mono text-sm outline-none focus:border-primary transition-colors"/>
            </div>
          </div>
          <div>
            <label className="block font-mono text-[9px] text-muted-foreground tracking-[0.14em] uppercase mb-2">Features</label>
            <div className="bg-secondary/50 border border-border rounded-lg p-3">
              <FeaturesBuilder rows={rows} onChange={setRows}/>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border flex gap-2 shrink-0">
          <button onClick={submit} disabled={saving}
            className="flex-1 bg-primary text-primary-foreground rounded py-2.5 text-sm font-bold tracking-[0.06em] uppercase cursor-pointer hover:opacity-90 disabled:opacity-50 transition-opacity">
            {saving?'Saving…':isEdit?'Update Plan':'Create Plan'}
          </button>
          <button onClick={onClose} className="px-4 bg-secondary border border-border rounded py-2.5 text-sm text-muted-foreground cursor-pointer hover:border-primary/50 transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
};

const PlanDeleteConfirm = ({ plan, onClose, onDeleted }: { plan:Plan; onClose:()=>void; onDeleted:()=>void }) => {
  const [del, setDel] = useState(false);
  const confirm = async () => {
    setDel(true);
    try { await apiDelete(`/plans/${plan.id}`); toast.success('Plan deleted'); onDeleted(); }
    catch { toast.error('Delete failed'); setDel(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40"/>
      <div className="relative w-[360px] bg-background border border-border rounded-xl p-6 shadow-2xl" onClick={e=>e.stopPropagation()}>
        <div className="text-center mb-5">
          <div className="text-sm font-bold mb-1">Delete Plan</div>
          <div className="text-[12px] text-muted-foreground"><span className="text-foreground font-semibold">{plan.name}</span> will be permanently removed.</div>
        </div>
        <div className="flex gap-2">
          <button onClick={confirm} disabled={del}
            className="flex-1 bg-destructive text-white rounded py-2.5 text-sm font-bold uppercase cursor-pointer hover:opacity-90 disabled:opacity-50 transition-opacity">
            {del?'Deleting…':'Delete'}
          </button>
          <button onClick={onClose} className="flex-1 bg-secondary border border-border rounded py-2.5 text-sm text-muted-foreground cursor-pointer hover:border-primary/50 transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
};

const PLAN_ACCENTS = [
  'from-primary/20 to-primary/5 border-primary/30',
  'from-accent/20 to-accent/5 border-accent/30',
  'from-muted to-muted/50 border-border',
];

const PlansTab = () => {
  const [plans, setPlans]       = useState<Plan[]>([]);
  const [loading, setLoading]   = useState(true);
  const [panel, setPanel]       = useState<Plan|'new'|null>(null);
  const [delPlan, setDelPlan]   = useState<Plan|null>(null);

  const load = useCallback(async () => {
    try { const r=await apiGet<Plan[]>('/plans'); setPlans(Array.isArray(r.data)?r.data:[]); }
    catch { toast.error('Failed to load plans'); } finally { setLoading(false); }
  }, []);
  useEffect(()=>{ load(); },[load]);

  const totalMRR = plans.reduce((s,p)=>s+Number(p.price),0);

  return (
    <>
      {panel!==null&&<PlanForm initial={panel==='new'?undefined:panel} onClose={()=>setPanel(null)} onSaved={()=>{setPanel(null);load();}}/>}
      {delPlan&&<PlanDeleteConfirm plan={delPlan} onClose={()=>setDelPlan(null)} onDeleted={()=>{setDelPlan(null);load();}}/>}

      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          {label:'Total Plans',value:plans.length,style:'text-foreground'},
          {label:'Price Range',value:plans.length?`$${Math.min(...plans.map(p=>Number(p.price))).toFixed(0)}–$${Math.max(...plans.map(p=>Number(p.price))).toFixed(0)}`:'—',style:'text-primary'},
          {label:'Combined MRR',value:`$${totalMRR.toFixed(2)}`,style:'text-accent'},
        ].map(s=>(
          <div key={s.label} className="bg-card border border-border rounded-lg p-4">
            <div className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground mb-1.5">{s.label}</div>
            <div className={cn('font-mono text-2xl font-semibold leading-none',s.style)}>{s.value}</div>
          </div>
        ))}
      </div>

      <PermissionGuard entity="plans" action="create">
        <button onClick={()=>setPanel('new')}
          className="mb-4 bg-primary text-primary-foreground rounded-md px-4 py-2 text-[13px] font-bold tracking-[0.06em] uppercase cursor-pointer hover:opacity-90 transition-opacity">
          + Create Plan
        </button>
      </PermissionGuard>

      {loading ? <div className="p-10 text-center font-mono text-[11px] text-muted-foreground">Loading…</div>
      : plans.length===0 ? (
        <div className="bg-card border border-dashed border-border rounded-xl p-16 text-center">
          <div className="font-mono text-[11px] text-muted-foreground mb-3">No pricing plans yet</div>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {plans.map((plan,i)=>(
            <div key={plan.id} className="bg-card border border-border rounded-xl overflow-hidden flex flex-col group hover:border-primary/40 transition-colors">
              <div className={cn('bg-gradient-to-br p-5 border-b',PLAN_ACCENTS[i%PLAN_ACCENTS.length])}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground mb-1.5">Pricing Plan</div>
                    <div className="text-base font-bold text-foreground">{plan.name}</div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <PermissionGuard entity="plans" action="update">
                      <button onClick={()=>setPanel(plan)} className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9.5 1.5l2 2-7 7H2.5v-2l7-7z"/></svg>
                      </button>
                    </PermissionGuard>
                    <PermissionGuard entity="plans" action="delete">
                      <button onClick={()=>setDelPlan(plan)} className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1.5 3.5h10M4 3.5V2h5v1.5M5 6v4M8 6v4M2 3.5l.8 7.5h7.4l.8-7.5"/></svg>
                      </button>
                    </PermissionGuard>
                  </div>
                </div>
                <div className="mt-3 font-mono text-[32px] font-semibold text-foreground tracking-tight leading-none">
                  ${Number(plan.price).toFixed(2)}<span className="text-xs text-muted-foreground font-normal ml-1">/mo</span>
                </div>
              </div>
              <div className="flex-1 p-5">
                {Object.keys(plan.features).length===0
                  ? <div className="font-mono text-[10px] text-muted-foreground/60 italic">No features defined</div>
                  : Object.entries(plan.features).map(([k,v])=>(
                    <div key={k} className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-primary/60 shrink-0"/>
                        <span className="text-[12px] text-muted-foreground">{k}</span>
                      </div>
                      <span className="font-mono text-[11px] text-foreground font-medium">{String(v)}</span>
                    </div>
                  ))
                }
              </div>
              <div className="px-5 py-3 border-t border-border bg-secondary/30 flex items-center justify-between">
                <span className="font-mono text-[9px] text-muted-foreground">{Object.keys(plan.features).length} features</span>
                <DateTime value={plan.createdAt} format="date" />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   TAB 2: Tenant Subscriptions
══════════════════════════════════════════════════════════════════════════════ */

const SubForm = ({ tenants, plans, onClose, onSaved }: {
  tenants: Tenant[]; plans: Plan[]; onClose:()=>void; onSaved:()=>void;
}) => {
  const [tenantId, setTenantId]     = useState('');
  const [planId, setPlanId]         = useState('');
  const [cycle, setCycle]           = useState<'monthly'|'annual'|'one_time'>('monthly');
  const [startsAt, setStartsAt]     = useState('');
  const [expiresAt, setExpiresAt]   = useState('');
  const [saving, setSaving]         = useState(false);

  const submit = async () => {
    if (!tenantId||!planId) { toast.error('Tenant and plan are required'); return; }
    setSaving(true);
    try {
      await apiPost(`/tenants/${tenantId}/subscriptions`, {
        planId, billingCycle: cycle,
        startsAt:  startsAt  || undefined,
        expiresAt: expiresAt || null,
      });
      toast.success('Subscription created');
      onSaved();
    } catch { toast.error('Failed to create subscription'); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/30"/>
      <div className="w-[400px] bg-background border-l border-border flex flex-col shadow-2xl" onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-border flex items-center justify-between shrink-0">
          <div><div className="text-sm font-bold tracking-[0.04em] uppercase">New Subscription</div>
            <div className="font-mono text-[10px] text-muted-foreground mt-0.5">Subscribe a tenant to a plan</div></div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1"><CloseIcon/></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
          <div><label className="block font-mono text-[9px] text-muted-foreground tracking-[0.14em] uppercase mb-1.5">Tenant</label>
            <SearchableDropdown options={tenants.map(t=>({value:t.id,label:t.name,sub:t.status}))} value={tenantId} onChange={setTenantId} placeholder="Select tenant…"/>
          </div>
          <div><label className="block font-mono text-[9px] text-muted-foreground tracking-[0.14em] uppercase mb-1.5">Plan</label>
            <SearchableDropdown options={plans.map(p=>({value:p.id,label:p.name,sub:`$${Number(p.price).toFixed(2)}/mo`}))} value={planId} onChange={setPlanId} placeholder="Select plan…"/>
          </div>
          <div><label className="block font-mono text-[9px] text-muted-foreground tracking-[0.14em] uppercase mb-1.5">Billing Cycle</label>
            <div className="flex gap-2">
              {(['monthly','annual','one_time'] as const).map(c=>(
                <button key={c} type="button" onClick={()=>setCycle(c)}
                  className={cn('flex-1 font-mono text-[9px] tracking-[0.08em] uppercase py-2 rounded border transition-colors cursor-pointer',
                    cycle===c?'bg-primary/15 text-primary border-primary/40':'bg-card text-muted-foreground border-border hover:border-primary/40')}>
                  {c.replace('_',' ')}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block font-mono text-[9px] text-muted-foreground tracking-[0.14em] uppercase mb-1.5">Starts At</label>
              <input type="date" value={startsAt} onChange={e=>setStartsAt(e.target.value)}
                className="w-full bg-secondary border border-border rounded px-3 py-2 text-foreground font-mono text-[11px] outline-none focus:border-primary transition-colors"/>
            </div>
            <div><label className="block font-mono text-[9px] text-muted-foreground tracking-[0.14em] uppercase mb-1.5">Expires At</label>
              <input type="date" value={expiresAt} onChange={e=>setExpiresAt(e.target.value)}
                className="w-full bg-secondary border border-border rounded px-3 py-2 text-foreground font-mono text-[11px] outline-none focus:border-primary transition-colors"/>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border flex gap-2 shrink-0">
          <button onClick={submit} disabled={saving}
            className="flex-1 bg-primary text-primary-foreground rounded py-2.5 text-sm font-bold tracking-[0.06em] uppercase cursor-pointer hover:opacity-90 disabled:opacity-50 transition-opacity">
            {saving?'Creating…':'Create Subscription'}
          </button>
          <button onClick={onClose} className="px-4 bg-secondary border border-border rounded py-2.5 text-sm text-muted-foreground cursor-pointer hover:border-primary/50 transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
};

const TenantSubscriptionsTab = () => {
  const [subs, setSubs]         = useState<TenantSub[]>([]);
  const [tenants, setTenants]   = useState<Tenant[]>([]);
  const [plans, setPlans]       = useState<Plan[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const [tr, pr] = await Promise.all([apiGet<Tenant[]>('/tenants'), apiGet<Plan[]>('/plans')]);
      const ts = Array.isArray(tr.data)?tr.data:[];
      setTenants(ts);
      setPlans(Array.isArray(pr.data)?pr.data:[]);
      const all = await Promise.all(
        ts.map(t=>apiGet<TenantSub[]>(`/tenants/${t.id}/subscriptions`)
          .then(r=>(Array.isArray(r.data)?r.data:[]).map(s=>({...s,tenantId:t.id,tenantName:t.name})))
          .catch(()=>[] as TenantSub[]))
      );
      setSubs(all.flat().sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()));
    } catch { toast.error('Failed to load subscriptions'); } finally { setLoading(false); }
  }, []);
  useEffect(()=>{ load(); },[load]);

  const cancel = async (s: TenantSub) => {
    try { await apiPatch(`/tenants/${s.tenantId}/subscriptions/${s.id}`,{status:'cancelled'}); toast.success('Cancelled'); load(); }
    catch { toast.error('Failed'); }
  };

  return (
    <>
      {showForm&&<SubForm tenants={tenants} plans={plans} onClose={()=>setShowForm(false)} onSaved={()=>{setShowForm(false);load();}}/>}
      <div className="flex items-center justify-between mb-4">
        <span className="font-mono text-[10px] text-muted-foreground tracking-[0.06em]">{subs.length} subscription{subs.length!==1?'s':''}</span>
        <PermissionGuard entity="subscriptions" action="create">
          <button onClick={()=>setShowForm(true)}
            className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-[13px] font-bold tracking-[0.06em] uppercase cursor-pointer hover:opacity-90 transition-opacity">
            + New Subscription
          </button>
        </PermissionGuard>
      </div>
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              {['Tenant','Plan','Cycle','Status','Starts','Expires',''].map(h=>(
                <th key={h} className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground px-4 py-2.5 text-left font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading?(<tr><td colSpan={7} className="p-8 text-center font-mono text-[11px] text-muted-foreground">Loading…</td></tr>)
            :subs.length===0?(<tr><td colSpan={7} className="p-8 text-center font-mono text-[11px] text-muted-foreground">No subscriptions</td></tr>)
            :subs.map(s=>(
              <tr key={s.id} className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors group">
                <td className="px-4 py-3 text-[13px] font-semibold">{s.tenantName}</td>
                <td className="px-4 py-3">
                  <div className="text-[13px] font-semibold">{s.plan_name}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">${Number(s.plan_price).toFixed(2)}/mo</div>
                </td>
                <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">{s.billing_cycle?.replace('_',' ')??'—'}</td>
                <td className="px-4 py-3">
                  <span className={cn('font-mono text-[9px] tracking-[0.1em] uppercase px-2 py-0.5 rounded-[3px] border',SUB_BADGE[s.status]??SUB_BADGE.cancelled)}>{s.status}</span>
                </td>
                <td className="px-4 py-3"><DateTime value={s.starts_at} format="date" /></td>
                <td className="px-4 py-3"><DateTime value={s.expires_at} format="date" fallback="∞" /></td>
                <td className="px-4 py-3">
                  {s.status==='active'&&(
                    <PermissionGuard entity="subscriptions" action="update">
                      <button onClick={()=>cancel(s)}
                        className="font-mono text-[9px] tracking-[0.08em] uppercase px-2 py-1 rounded border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100">
                        Cancel
                      </button>
                    </PermissionGuard>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   TAB 3: Tenant Invoices
══════════════════════════════════════════════════════════════════════════════ */

const InvForm = ({ tenants, onClose, onSaved }: { tenants:Tenant[]; onClose:()=>void; onSaved:()=>void }) => {
  const [tenantId, setTenantId]   = useState('');
  const [amount, setAmount]       = useState('');
  const [desc, setDesc]           = useState('');
  const [dueDate, setDueDate]     = useState('');
  const [saving, setSaving]       = useState(false);

  const submit = async () => {
    if (!tenantId||!amount) { toast.error('Tenant and amount are required'); return; }
    setSaving(true);
    try {
      await apiPost(`/tenants/${tenantId}/invoices`,{amount:Number(amount),description:desc||null,dueDate:dueDate||null});
      toast.success('Invoice created'); onSaved();
    } catch { toast.error('Failed'); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/30"/>
      <div className="w-[380px] bg-background border-l border-border flex flex-col shadow-2xl" onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-border flex items-center justify-between shrink-0">
          <div><div className="text-sm font-bold tracking-[0.04em] uppercase">New Invoice</div>
            <div className="font-mono text-[10px] text-muted-foreground mt-0.5">Create a platform invoice</div></div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1"><CloseIcon/></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
          <div><label className="block font-mono text-[9px] text-muted-foreground tracking-[0.14em] uppercase mb-1.5">Tenant</label>
            <SearchableDropdown options={tenants.map(t=>({value:t.id,label:t.name,sub:t.status}))} value={tenantId} onChange={setTenantId} placeholder="Select tenant…"/>
          </div>
          <div><label className="block font-mono text-[9px] text-muted-foreground tracking-[0.14em] uppercase mb-1.5">Amount (USD)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[13px] text-muted-foreground">$</span>
              <input type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00"
                className="w-full bg-secondary border border-border rounded pl-7 pr-3 py-2 text-foreground font-mono text-sm outline-none focus:border-primary transition-colors"/>
            </div>
          </div>
          <div><label className="block font-mono text-[9px] text-muted-foreground tracking-[0.14em] uppercase mb-1.5">Description</label>
            <input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="e.g. Monthly platform fee"
              className="w-full bg-secondary border border-border rounded px-3 py-2 text-foreground text-sm outline-none focus:border-primary transition-colors"/>
          </div>
          <div><label className="block font-mono text-[9px] text-muted-foreground tracking-[0.14em] uppercase mb-1.5">Due Date (optional)</label>
            <input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}
              className="w-full bg-secondary border border-border rounded px-3 py-2 text-foreground font-mono text-[11px] outline-none focus:border-primary transition-colors"/>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border flex gap-2 shrink-0">
          <button onClick={submit} disabled={saving}
            className="flex-1 bg-primary text-primary-foreground rounded py-2.5 text-sm font-bold tracking-[0.06em] uppercase cursor-pointer hover:opacity-90 disabled:opacity-50 transition-opacity">
            {saving?'Creating…':'Create Invoice'}
          </button>
          <button onClick={onClose} className="px-4 bg-secondary border border-border rounded py-2.5 text-sm text-muted-foreground cursor-pointer hover:border-primary/50 transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
};

const TenantInvoicesTab = () => {
  const [invs, setInvs]         = useState<TenantInv[]>([]);
  const [tenants, setTenants]   = useState<Tenant[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const tr = await apiGet<Tenant[]>('/tenants');
      const ts = Array.isArray(tr.data)?tr.data:[];
      setTenants(ts);
      const all = await Promise.all(
        ts.map(t=>apiGet<TenantInv[]>(`/tenants/${t.id}/invoices`)
          .then(r=>(Array.isArray(r.data)?r.data:[]).map(i=>({...i,tenantId:t.id,tenantName:t.name})))
          .catch(()=>[] as TenantInv[]))
      );
      setInvs(all.flat().sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()));
    } catch { toast.error('Failed to load invoices'); } finally { setLoading(false); }
  }, []);
  useEffect(()=>{ load(); },[load]);

  const markPaid = async (inv: TenantInv) => {
    try { await apiPatch(`/tenants/${inv.tenantId}/invoices/${inv.id}`,{status:'paid',paidAt:new Date().toISOString()}); toast.success('Marked paid'); load(); }
    catch { toast.error('Failed'); }
  };
  const voidInv = async (inv: TenantInv) => {
    try { await apiPatch(`/tenants/${inv.tenantId}/invoices/${inv.id}`,{status:'void'}); toast.success('Voided'); load(); }
    catch { toast.error('Failed'); }
  };

  const outstanding = invs.filter(i=>i.status==='unpaid').reduce((s,i)=>s+Number(i.amount),0);

  return (
    <>
      {showForm&&<InvForm tenants={tenants} onClose={()=>setShowForm(false)} onSaved={()=>{setShowForm(false);load();}}/>}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <span className="font-mono text-[10px] text-muted-foreground">{invs.length} invoice{invs.length!==1?'s':''}</span>
          {outstanding>0&&<span className="font-mono text-[10px] text-destructive">Outstanding: ${outstanding.toFixed(2)}</span>}
        </div>
        <PermissionGuard entity="invoices" action="create">
          <button onClick={()=>setShowForm(true)}
            className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-[13px] font-bold tracking-[0.06em] uppercase cursor-pointer hover:opacity-90 transition-opacity">
            + New Invoice
          </button>
        </PermissionGuard>
      </div>
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              {['Tenant','Amount','Description','Status','Due','Paid',''].map(h=>(
                <th key={h} className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground px-4 py-2.5 text-left font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading?(<tr><td colSpan={7} className="p-8 text-center font-mono text-[11px] text-muted-foreground">Loading…</td></tr>)
            :invs.length===0?(<tr><td colSpan={7} className="p-8 text-center font-mono text-[11px] text-muted-foreground">No invoices</td></tr>)
            :invs.map(inv=>(
              <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors group">
                <td className="px-4 py-3 text-[13px] font-semibold">{inv.tenantName}</td>
                <td className="px-4 py-3 font-mono text-[13px] font-semibold text-foreground">${Number(inv.amount).toFixed(2)}</td>
                <td className="px-4 py-3 text-[12px] text-muted-foreground max-w-[160px] truncate">{inv.description??'—'}</td>
                <td className="px-4 py-3">
                  <span className={cn('font-mono text-[9px] tracking-[0.1em] uppercase px-2 py-0.5 rounded-[3px] border',INV_BADGE[inv.status]??INV_BADGE.void)}>{inv.status}</span>
                </td>
                <td className="px-4 py-3"><DateTime value={inv.due_date} format="date" /></td>
                <td className="px-4 py-3"><DateTime value={inv.paid_at} format="datetime" /></td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {inv.status==='unpaid'&&(
                      <PermissionGuard entity="invoices" action="update">
                        <button onClick={()=>markPaid(inv)}
                          className="font-mono text-[8px] tracking-[0.08em] uppercase px-2 py-1 rounded border border-accent/30 text-accent hover:bg-accent/10 transition-colors">
                          Mark Paid
                        </button>
                      </PermissionGuard>
                    )}
                    {inv.status!=='void'&&(
                      <PermissionGuard entity="invoices" action="update">
                        <button onClick={()=>voidInv(inv)}
                          className="font-mono text-[8px] tracking-[0.08em] uppercase px-2 py-1 rounded border border-border text-muted-foreground hover:border-destructive/40 hover:text-destructive transition-colors">
                          Void
                        </button>
                      </PermissionGuard>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   Main Page
══════════════════════════════════════════════════════════════════════════════ */

type Tab = 'plans' | 'subscriptions' | 'invoices';
const TABS: { id: Tab; label: string }[] = [
  { id: 'plans',         label: 'Plans' },
  { id: 'subscriptions', label: 'Tenant Subscriptions' },
  { id: 'invoices',      label: 'Tenant Invoices' },
];

const BillingPage = () => {
  const [tab, setTab] = useState<Tab>('plans');
  return (
    <>
      <div>
        <h1 className="text-sm font-bold tracking-[0.04em] text-foreground uppercase">Plans &amp; Billing</h1>
        <p className="font-mono text-[10px] text-muted-foreground tracking-[0.06em] mt-1">Platform-level pricing and tenant billing</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border pb-0">
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            className={cn(
              'font-mono text-[10px] tracking-[0.1em] uppercase px-4 py-2.5 border-b-2 transition-colors cursor-pointer -mb-px',
              tab===t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}>
            {t.label}
          </button>
        ))}
      </div>

      {tab==='plans'         && <PlansTab/>}
      {tab==='subscriptions' && <TenantSubscriptionsTab/>}
      {tab==='invoices'      && <TenantInvoicesTab/>}
    </>
  );
};

export default BillingPage;
