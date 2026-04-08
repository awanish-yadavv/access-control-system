'use client';

import { useEffect, useState, useMemo } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';
import PermissionGuard from '@/components/auth/PermissionGuard';
import cn from '@/lib/cn';
import toast from 'react-hot-toast';
import DateTime from '@/components/ui/DateTime';
import { UserType } from '@/types/api.types';

interface Role {
  id: string;
  name: string;
  isSystem: boolean;
}

interface TenantOption {
  id: string;
  name: string;
  status: string;
}

interface User {
  id: string;
  email: string;
  userType: UserType;
  tenantId: string | null;
  createdAt: string;
  roles: Role[];
}

/* ── helpers ── */

const TYPE_BADGE: Record<UserType, string> = {
  SYSTEM:   'bg-primary/12 text-primary border-primary/25',
  TENANT:   'bg-accent/15 text-accent border-accent/25',
  CUSTOMER: 'bg-muted text-muted-foreground border-border',
};

const Avatar = ({ email }: { email: string }) => (
  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center text-white text-[11px] font-bold shrink-0">
    {email.slice(0, 2).toUpperCase()}
  </div>
);

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M1 1l12 12M13 1L1 13"/>
  </svg>
);

/* ── Create / Edit panel ── */

interface UserFormProps {
  initial?: User;
  onClose: () => void;
  onSaved: () => void;
}

const UserForm = ({ initial, onClose, onSaved }: UserFormProps) => {
  const isEdit = !!initial;
  const [email, setEmail]         = useState(initial?.email ?? '');
  const [password, setPassword]   = useState('');
  const [userType, setUserType]   = useState<UserType>(initial?.userType ?? 'CUSTOMER');
  const [tenantId, setTenantId]   = useState(initial?.tenantId ?? '');
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(
    new Set(initial?.roles?.map((r) => r.id) ?? []),
  );
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [tenants, setTenants]     = useState<TenantOption[]>([]);
  const [tenantSearch, setTenantSearch] = useState('');
  const [showTenantDrop, setShowTenantDrop] = useState(false);
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    apiGet<Role[]>('/roles').then((res) => {
      setAvailableRoles(Array.isArray(res.data) ? res.data : []);
    }).catch(() => {});
    apiGet<TenantOption[]>('/tenants').then((res) => {
      setTenants(Array.isArray(res.data) ? res.data : []);
    }).catch(() => {});
  }, []);

  const selectedTenant = tenants.find((t) => t.id === tenantId);
  const filteredTenants = tenants.filter((t) =>
    t.name.toLowerCase().includes(tenantSearch.toLowerCase()),
  );

  const toggleRole = (id: string) =>
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const submit = async () => {
    if (!email || (!isEdit && !password)) {
      toast.error('Email and password are required'); return;
    }
    setSaving(true);
    try {
      const body: Record<string, string | null> = { email, userType };
      if (password) body.password = password;
      body.tenantId = tenantId || null;

      let userId: string;
      if (isEdit) {
        await apiPatch(`/users/${initial!.id}`, body);
        userId = initial!.id;
      } else {
        const created = await apiPost<{ id: string }>('/users', body);
        userId = created.data.id;
      }

      // Assign roles
      await apiPatch(`/users/${userId}/roles`, { roleIds: [...selectedRoles] });

      toast.success(isEdit ? 'User updated' : 'User created');
      onSaved();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Operation failed';
      toast.error(msg);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      {/* backdrop */}
      <div className="flex-1 bg-black/30" />
      {/* panel */}
      <div
        className="w-[380px] bg-background border-l border-border flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="px-6 py-5 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-sm font-bold tracking-[0.04em] text-foreground uppercase">
              {isEdit ? 'Edit User' : 'Create User'}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground tracking-[0.06em] mt-0.5">
              {isEdit ? initial!.email : 'New platform account'}
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1">
            <CloseIcon />
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
          <div>
            <label className="block font-mono text-[9px] text-muted-foreground tracking-[0.14em] uppercase mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full bg-secondary border border-border rounded px-3 py-2 text-foreground text-sm outline-none focus:border-primary transition-colors"
            />
          </div>

          <div>
            <label className="block font-mono text-[9px] text-muted-foreground tracking-[0.14em] uppercase mb-1.5">
              Password {isEdit && <span className="normal-case text-muted-foreground/60">(leave blank to keep)</span>}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isEdit ? '••••••••' : 'Min 8 characters'}
              className="w-full bg-secondary border border-border rounded px-3 py-2 text-foreground text-sm outline-none focus:border-primary transition-colors"
            />
          </div>

          <div>
            <label className="block font-mono text-[9px] text-muted-foreground tracking-[0.14em] uppercase mb-1.5">User Type</label>
            <div className="flex gap-2">
              {(['SYSTEM', 'TENANT', 'CUSTOMER'] as UserType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setUserType(t)}
                  className={cn(
                    'flex-1 font-mono text-[9px] tracking-[0.1em] uppercase py-2 rounded-[4px] border transition-colors cursor-pointer',
                    userType === t
                      ? TYPE_BADGE[t]
                      : 'bg-card text-muted-foreground border-border hover:border-primary/40',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {(userType === 'TENANT' || userType === 'CUSTOMER') && (
            <div className="relative">
              <label className="block font-mono text-[9px] text-muted-foreground tracking-[0.14em] uppercase mb-1.5">
                Tenant <span className="normal-case text-muted-foreground/60">(optional)</span>
              </label>
              <button
                type="button"
                onClick={() => setShowTenantDrop(!showTenantDrop)}
                className={cn(
                  'w-full bg-secondary border rounded px-3 py-2 text-left font-mono text-[11px] outline-none transition-colors flex items-center justify-between gap-2',
                  showTenantDrop ? 'border-primary' : 'border-border hover:border-primary/50',
                )}
              >
                <span className={selectedTenant ? 'text-foreground' : 'text-muted-foreground'}>
                  {selectedTenant ? selectedTenant.name : 'Select a tenant…'}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {tenantId && (
                    <span
                      role="button"
                      onClick={(e) => { e.stopPropagation(); setTenantId(''); }}
                      className="text-muted-foreground hover:text-destructive transition-colors text-[10px] cursor-pointer"
                    >
                      ×
                    </span>
                  )}
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"
                    className={cn('text-muted-foreground transition-transform', showTenantDrop ? 'rotate-180' : '')}>
                    <path d="M2 3.5l3 3 3-3" />
                  </svg>
                </div>
              </button>

              {showTenantDrop && (
                <div className="absolute top-full left-0 mt-1 w-full bg-card border border-border rounded-lg shadow-xl z-20 overflow-hidden">
                  <div className="p-2 border-b border-border">
                    <input
                      autoFocus
                      value={tenantSearch}
                      onChange={(e) => setTenantSearch(e.target.value)}
                      placeholder="Search tenants…"
                      className="w-full bg-secondary border border-border rounded px-2.5 py-1.5 font-mono text-[11px] text-foreground outline-none focus:border-primary transition-colors"
                    />
                  </div>
                  <div className="max-h-[160px] overflow-y-auto">
                    {filteredTenants.length === 0 ? (
                      <div className="px-3 py-3 font-mono text-[10px] text-muted-foreground text-center">No tenants found</div>
                    ) : filteredTenants.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => { setTenantId(t.id); setShowTenantDrop(false); setTenantSearch(''); }}
                        className={cn(
                          'w-full px-3 py-2.5 text-left flex items-center justify-between hover:bg-secondary/70 transition-colors',
                          tenantId === t.id && 'bg-primary/10',
                        )}
                      >
                        <span className="font-mono text-[11px] text-foreground">{t.name}</span>
                        <span className={cn(
                          'font-mono text-[8px] tracking-[0.1em] uppercase px-1.5 py-0.5 rounded-[3px] border',
                          t.status === 'active' ? 'bg-accent/10 text-accent border-accent/25' : 'bg-muted text-muted-foreground border-border',
                        )}>{t.status}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Roles */}
          <div>
            <label className="block font-mono text-[9px] text-muted-foreground tracking-[0.14em] uppercase mb-2">
              Roles
              {selectedRoles.size > 0 && (
                <span className="ml-2 text-primary normal-case">({selectedRoles.size} selected)</span>
              )}
            </label>
            {availableRoles.length === 0 ? (
              <div className="font-mono text-[10px] text-muted-foreground/60">Loading roles…</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {availableRoles.map((role) => {
                  const active = selectedRoles.has(role.id);
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => toggleRole(role.id)}
                      className={cn(
                        'font-mono text-[9px] tracking-[0.1em] uppercase px-2.5 py-1 rounded-[4px] border cursor-pointer transition-all',
                        active
                          ? 'bg-primary/15 text-primary border-primary/40 shadow-sm'
                          : 'bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground',
                      )}
                    >
                      {active && <span className="mr-1">✓</span>}
                      {role.name}
                      {role.isSystem && <span className="ml-1 text-primary/60">·sys</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* footer */}
        <div className="px-6 py-4 border-t border-border flex gap-2">
          <button
            onClick={submit}
            disabled={saving}
            className="flex-1 bg-primary text-primary-foreground rounded py-2.5 text-sm font-bold tracking-[0.06em] uppercase cursor-pointer hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? 'Saving...' : isEdit ? 'Update' : 'Create User'}
          </button>
          <button
            onClick={onClose}
            className="px-4 bg-secondary border border-border rounded py-2.5 text-sm text-muted-foreground cursor-pointer hover:border-primary/50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Delete confirmation ── */

const DeleteConfirm = ({ user, onClose, onDeleted }: { user: User; onClose: () => void; onDeleted: () => void }) => {
  const [deleting, setDeleting] = useState(false);

  const confirm = async () => {
    setDeleting(true);
    try {
      await apiDelete(`/users/${user.id}`);
      toast.success('User deleted');
      onDeleted();
    } catch { toast.error('Delete failed'); setDeleting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-[360px] bg-background border border-border rounded-xl p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-10 rounded-full bg-destructive/12 border border-destructive/25 grid place-items-center text-destructive mx-auto mb-4">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9h8l1-9"/>
          </svg>
        </div>
        <div className="text-center mb-5">
          <div className="text-sm font-bold text-foreground mb-1">Delete User</div>
          <div className="text-[12px] text-muted-foreground">
            <span className="text-foreground font-semibold">{user.email}</span> will be permanently removed.
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={confirm}
            disabled={deleting}
            className="flex-1 bg-destructive text-white rounded py-2.5 text-sm font-bold tracking-[0.04em] uppercase cursor-pointer hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
          <button onClick={onClose} className="flex-1 bg-secondary border border-border rounded py-2.5 text-sm text-muted-foreground cursor-pointer hover:border-primary/50 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Main page ── */

const UsersPage = () => {
  const [users, setUsers]           = useState<User[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | UserType>('ALL');
  const [panelUser, setPanelUser]   = useState<User | 'new' | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);

  const load = async () => {
    try {
      const res = await apiGet<User[]>('/users');
      setUsers(Array.isArray(res.data) ? res.data : []);
    } catch { toast.error('Failed to load users'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => users.filter((u) => {
    const matchSearch = search === '' || u.email.toLowerCase().includes(search.toLowerCase());
    const matchType   = typeFilter === 'ALL' || u.userType === typeFilter;
    return matchSearch && matchType;
  }), [users, search, typeFilter]);

  const counts = useMemo(() => ({
    total:    users.length,
    SYSTEM:   users.filter((u) => u.userType === 'SYSTEM').length,
    TENANT:   users.filter((u) => u.userType === 'TENANT').length,
    CUSTOMER: users.filter((u) => u.userType === 'CUSTOMER').length,
  }), [users]);

  return (
    <>
      {/* Panels */}
      {panelUser !== null && (
        <UserForm
          initial={panelUser === 'new' ? undefined : panelUser}
          onClose={() => setPanelUser(null)}
          onSaved={() => { setPanelUser(null); load(); }}
        />
      )}
      {deleteUser && (
        <DeleteConfirm
          user={deleteUser}
          onClose={() => setDeleteUser(null)}
          onDeleted={() => { setDeleteUser(null); load(); }}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-sm font-bold tracking-[0.04em] text-foreground uppercase">Users</h1>
          <p className="font-mono text-[10px] text-muted-foreground tracking-[0.06em] mt-1">{counts.total} platform accounts</p>
        </div>
        <PermissionGuard entity="users" action="create">
          <button
            onClick={() => setPanelUser('new')}
            className="bg-primary text-primary-foreground border-none rounded-md px-4 py-2 text-[13px] font-bold tracking-[0.06em] uppercase cursor-pointer hover:opacity-90 transition-opacity"
          >
            + Create User
          </button>
        </PermissionGuard>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {([
          { key: 'ALL',      label: 'Total',     value: counts.total,    style: 'text-foreground' },
          { key: 'SYSTEM',   label: 'System',    value: counts.SYSTEM,   style: 'text-primary' },
          { key: 'TENANT',   label: 'Tenants',   value: counts.TENANT,   style: 'text-accent' },
          { key: 'CUSTOMER', label: 'Customers', value: counts.CUSTOMER, style: 'text-muted-foreground' },
        ] as const).map(({ key, label, value, style }) => (
          <button
            key={key}
            onClick={() => setTypeFilter(key)}
            className={cn(
              'bg-card border rounded-lg p-4 text-left transition-all cursor-pointer',
              typeFilter === key ? 'border-primary shadow-sm' : 'border-border hover:border-primary/40',
            )}
          >
            <div className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground mb-1.5">{label}</div>
            <div className={cn('font-mono text-2xl font-semibold leading-none', style)}>{value}</div>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="5.5" cy="5.5" r="4.5"/>
            <path d="M9 9l3 3"/>
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email..."
            className="w-full bg-card border border-border rounded-md pl-8 pr-3 py-2 text-[13px] text-foreground outline-none focus:border-primary transition-colors placeholder:text-muted-foreground"
          />
        </div>

        {/* Type filter pills */}
        <div className="flex gap-1">
          {(['ALL', 'SYSTEM', 'TENANT', 'CUSTOMER'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={cn(
                'font-mono text-[9px] tracking-[0.1em] uppercase px-3 py-1.5 rounded-[4px] border cursor-pointer transition-colors',
                typeFilter === t
                  ? t === 'ALL' ? 'bg-foreground text-background border-foreground' : TYPE_BADGE[t as UserType]
                  : 'bg-card text-muted-foreground border-border hover:border-primary/40',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {search && (
          <button onClick={() => setSearch('')} className="font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors">
            Clear ×
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground px-5 py-2.5 text-left font-normal">User</th>
              <th className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground px-5 py-2.5 text-left font-normal">Type</th>
              <th className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground px-5 py-2.5 text-left font-normal">Roles</th>
              <th className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground px-5 py-2.5 text-left font-normal">Tenant</th>
              <th className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground px-5 py-2.5 text-left font-normal">Created</th>
              <th className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground px-5 py-2.5 text-left font-normal w-[80px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-10 text-center font-mono text-[11px] text-muted-foreground">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-10 text-center">
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {search ? `No users matching "${search}"` : 'No users found'}
                  </div>
                </td>
              </tr>
            ) : filtered.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors group">
                {/* User cell */}
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar email={u.email} />
                    <div>
                      <div className="text-[13px] font-semibold text-foreground">{u.email}</div>
                      <div className="font-mono text-[9px] text-muted-foreground tracking-[0.04em] mt-0.5">{u.id.slice(0, 12)}…</div>
                    </div>
                  </div>
                </td>

                {/* Type */}
                <td className="px-5 py-3">
                  <span className={cn('font-mono text-[9px] tracking-[0.1em] uppercase px-2 py-0.5 rounded-[3px] border', TYPE_BADGE[u.userType] ?? TYPE_BADGE.CUSTOMER)}>
                    {u.userType}
                  </span>
                </td>

                {/* Roles */}
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1">
                    {u.roles?.length > 0 ? u.roles.map((r) => (
                      <span key={r.id} className="font-mono text-[8px] tracking-[0.08em] px-1.5 py-0.5 rounded-[3px] bg-secondary border border-border text-muted-foreground uppercase">
                        {r.name}
                      </span>
                    )) : (
                      <span className="text-[11px] text-muted-foreground/50">—</span>
                    )}
                  </div>
                </td>

                {/* Tenant */}
                <td className="px-5 py-3 font-mono text-[10px] text-muted-foreground">
                  {u.tenantId ? (
                    <span className="px-1.5 py-0.5 rounded-[3px] bg-accent/10 text-accent border border-accent/20 text-[9px] tracking-[0.06em]">
                      {u.tenantId.slice(0, 8)}…
                    </span>
                  ) : '—'}
                </td>

                {/* Created */}
                <td className="px-5 py-3"><DateTime value={u.createdAt} format="datetime" /></td>

                {/* Actions */}
                <td className="px-5 py-3">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <PermissionGuard entity="users" action="update">
                      <button
                        onClick={() => setPanelUser(u)}
                        title="Edit"
                        className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      >
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M9.5 1.5l2 2-7 7H2.5v-2l7-7z"/>
                        </svg>
                      </button>
                    </PermissionGuard>
                    <PermissionGuard entity="users" action="delete">
                      <button
                        onClick={() => setDeleteUser(u)}
                        title="Delete"
                        className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M1.5 3.5h10M4 3.5V2h5v1.5M5 6v4M8 6v4M2 3.5l.8 7.5h7.4l.8-7.5"/>
                        </svg>
                      </button>
                    </PermissionGuard>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Footer count */}
        {!loading && filtered.length > 0 && (
          <div className="px-5 py-2.5 border-t border-border bg-secondary/30">
            <span className="font-mono text-[9px] text-muted-foreground tracking-[0.08em]">
              {filtered.length} of {users.length} users
              {typeFilter !== 'ALL' && ` · filtered by ${typeFilter}`}
              {search && ` · matching "${search}"`}
            </span>
          </div>
        )}
      </div>
    </>
  );
};

export default UsersPage;
