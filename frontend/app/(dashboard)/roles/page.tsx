'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';
import PermissionGuard from '@/components/auth/PermissionGuard';
import cn from '@/lib/cn';
import toast from 'react-hot-toast';
import { EntityPermissionMatrix, EntityName, PermissionAction } from '@/types/api.types';

interface Role {
  id: string;
  name: string;
  permissionMatrix: EntityPermissionMatrix;
  isSystem: boolean;
  createdAt: string;
}

const ENTITIES: EntityName[] = ['users', 'roles', 'tenants', 'devices', 'cards', 'plans', 'invoices', 'subscriptions', 'access_logs'];
const ACTIONS: PermissionAction[] = ['create', 'list', 'update', 'delete', 'export', 'manage'];

const emptyMatrix = (): EntityPermissionMatrix =>
  Object.fromEntries(ENTITIES.map((e) => [e, Object.fromEntries(ACTIONS.map((a) => [a, false]))])) as EntityPermissionMatrix;

/* ── Permission matrix summary bar ── */

const MatrixPreview = ({ matrix }: { matrix: EntityPermissionMatrix }) => {
  const totalGranted = ENTITIES.reduce((sum, e) => sum + ACTIONS.filter((a) => matrix[e]?.[a]).length, 0);
  const total = ENTITIES.length * ACTIONS.length;
  const pct = Math.round((totalGranted / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-secondary rounded-sm overflow-hidden max-w-[100px]">
        <div className="h-full bg-primary rounded-sm transition-[width_.3s]" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[10px] text-muted-foreground">{totalGranted}/{total} perms</span>
    </div>
  );
};

/* ── Close icon ── */

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M1 1l12 12M13 1L1 13" />
  </svg>
);

/* ── Editable permission matrix grid ── */

interface MatrixEditorProps {
  matrix: EntityPermissionMatrix;
  onChange: (matrix: EntityPermissionMatrix) => void;
  readonly?: boolean;
}

const MatrixEditor = ({ matrix, onChange, readonly }: MatrixEditorProps) => {
  const toggle = (entity: EntityName, action: PermissionAction) => {
    if (readonly) return;
    const next = { ...matrix, [entity]: { ...matrix[entity], [action]: !matrix[entity]?.[action] } };
    onChange(next as EntityPermissionMatrix);
  };

  const toggleRow = (entity: EntityName) => {
    if (readonly) return;
    const allOn = ACTIONS.every((a) => matrix[entity]?.[a]);
    const next = { ...matrix, [entity]: Object.fromEntries(ACTIONS.map((a) => [a, !allOn])) };
    onChange(next as EntityPermissionMatrix);
  };

  const toggleCol = (action: PermissionAction) => {
    if (readonly) return;
    const allOn = ENTITIES.every((e) => matrix[e]?.[action]);
    const next = { ...matrix };
    ENTITIES.forEach((e) => { next[e] = { ...next[e], [action]: !allOn }; });
    onChange(next as EntityPermissionMatrix);
  };

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse w-full">
        <thead>
          <tr>
            <th className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground pr-4 pb-2 text-left font-normal w-[120px]">Entity</th>
            {ACTIONS.map((a) => (
              <th key={a} className="font-mono text-[9px] tracking-[0.08em] uppercase text-muted-foreground px-2 pb-2 text-center font-normal">
                {readonly ? (
                  a
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleCol(a)}
                    className="hover:text-primary transition-colors cursor-pointer uppercase tracking-[0.08em]"
                    title={`Toggle all ${a}`}
                  >
                    {a}
                  </button>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ENTITIES.map((entity) => (
            <tr key={entity} className="group">
              <td className="pr-4 py-1">
                {readonly ? (
                  <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">{entity}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleRow(entity)}
                    className="font-mono text-[10px] text-muted-foreground hover:text-primary transition-colors cursor-pointer whitespace-nowrap text-left w-full"
                    title={`Toggle all for ${entity}`}
                  >
                    {entity}
                  </button>
                )}
              </td>
              {ACTIONS.map((action) => {
                const granted = matrix[entity]?.[action] === true;
                return (
                  <td key={action} className="px-2 py-1 text-center">
                    <button
                      type="button"
                      disabled={readonly}
                      onClick={() => toggle(entity, action)}
                      className={cn(
                        'inline-flex items-center justify-center w-5 h-5 rounded-[3px] text-[11px] border transition-all',
                        granted
                          ? 'bg-accent/15 border-accent/40 text-accent'
                          : 'bg-muted border-border text-transparent',
                        !readonly && 'cursor-pointer hover:border-primary/50',
                        readonly && 'cursor-default',
                      )}
                    >
                      {granted ? '✓' : ''}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {!readonly && (
        <p className="font-mono text-[9px] text-muted-foreground/60 mt-3 tracking-[0.06em]">
          Click a cell to toggle · Click entity name to toggle row · Click action header to toggle column
        </p>
      )}
    </div>
  );
};

/* ── Create / Edit panel ── */

interface RoleFormProps {
  initial?: Role;
  onClose: () => void;
  onSaved: () => void;
}

const RoleForm = ({ initial, onClose, onSaved }: RoleFormProps) => {
  const isEdit = !!initial;
  const [name, setName]         = useState(initial?.name ?? '');
  const [matrix, setMatrix]     = useState<EntityPermissionMatrix>(
    initial ? { ...emptyMatrix(), ...initial.permissionMatrix } : emptyMatrix(),
  );
  const [saving, setSaving]     = useState(false);

  const totalGranted = ENTITIES.reduce((sum, e) => sum + ACTIONS.filter((a) => matrix[e]?.[a]).length, 0);

  const submit = async () => {
    if (!name.trim()) { toast.error('Role name is required'); return; }
    setSaving(true);
    try {
      if (isEdit) {
        await apiPatch(`/roles/${initial!.id}`, { name, permissionMatrix: matrix });
      } else {
        await apiPost('/roles', { name, permissionMatrix: matrix });
      }
      toast.success(isEdit ? 'Role updated' : 'Role created');
      onSaved();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Operation failed';
      toast.error(msg);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/30" />
      <div
        className="w-[520px] bg-background border-l border-border flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="px-6 py-5 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <div className="text-sm font-bold tracking-[0.04em] text-foreground uppercase">
              {isEdit ? 'Edit Role' : 'Create Role'}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground tracking-[0.06em] mt-0.5">
              {isEdit ? initial!.name : 'Define name and permissions'}
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1">
            <CloseIcon />
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
          {/* Name */}
          <div>
            <label className="block font-mono text-[9px] text-muted-foreground tracking-[0.14em] uppercase mb-1.5">Role Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Gym Manager"
              className="w-full bg-secondary border border-border rounded px-3 py-2 text-foreground text-sm outline-none focus:border-primary transition-colors"
            />
          </div>

          {/* Permission matrix */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="font-mono text-[9px] text-muted-foreground tracking-[0.14em] uppercase">
                Permission Matrix
              </label>
              <span className="font-mono text-[9px] text-primary tracking-[0.06em]">
                {totalGranted} / {ENTITIES.length * ACTIONS.length} granted
              </span>
            </div>
            <div className="bg-secondary/50 border border-border rounded-lg p-4">
              <MatrixEditor matrix={matrix} onChange={setMatrix} />
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="px-6 py-4 border-t border-border flex gap-2 shrink-0">
          <button
            onClick={submit}
            disabled={saving}
            className="flex-1 bg-primary text-primary-foreground rounded py-2.5 text-sm font-bold tracking-[0.06em] uppercase cursor-pointer hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? 'Saving…' : isEdit ? 'Update Role' : 'Create Role'}
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

const DeleteConfirm = ({ role, onClose, onDeleted }: { role: Role; onClose: () => void; onDeleted: () => void }) => {
  const [deleting, setDeleting] = useState(false);

  const confirm = async () => {
    setDeleting(true);
    try {
      await apiDelete(`/roles/${role.id}`);
      toast.success('Role deleted');
      onDeleted();
    } catch { toast.error('Delete failed'); setDeleting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-[360px] bg-background border border-border rounded-xl p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-10 rounded-full bg-destructive/12 border border-destructive/25 grid place-items-center text-destructive mx-auto mb-4">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9h8l1-9" />
          </svg>
        </div>
        <div className="text-center mb-5">
          <div className="text-sm font-bold text-foreground mb-1">Delete Role</div>
          <div className="text-[12px] text-muted-foreground">
            <span className="text-foreground font-semibold">{role.name}</span> will be permanently removed.
            All users with this role will lose its permissions.
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={confirm}
            disabled={deleting}
            className="flex-1 bg-destructive text-white rounded py-2.5 text-sm font-bold tracking-[0.04em] uppercase cursor-pointer hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {deleting ? 'Deleting…' : 'Delete'}
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

const RolesPage = () => {
  const [roles, setRoles]           = useState<Role[]>([]);
  const [loading, setLoading]       = useState(true);
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [panelRole, setPanelRole]   = useState<Role | 'new' | null>(null);
  const [deleteRole, setDeleteRole] = useState<Role | null>(null);

  const load = async () => {
    try {
      const res = await apiGet<Role[]>('/roles');
      setRoles(Array.isArray(res.data) ? res.data : []);
    } catch { toast.error('Failed to load roles'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  return (
    <>
      {panelRole !== null && (
        <RoleForm
          initial={panelRole === 'new' ? undefined : panelRole}
          onClose={() => setPanelRole(null)}
          onSaved={() => { setPanelRole(null); load(); }}
        />
      )}
      {deleteRole && (
        <DeleteConfirm
          role={deleteRole}
          onClose={() => setDeleteRole(null)}
          onDeleted={() => { setDeleteRole(null); load(); }}
        />
      )}

      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-sm font-bold tracking-[0.04em] text-foreground uppercase">Roles &amp; Permissions</h1>
          <p className="font-mono text-[10px] text-muted-foreground tracking-[0.06em] mt-1">
            {roles.length} role{roles.length !== 1 ? 's' : ''} · EntityPermissionMatrix
          </p>
        </div>
        <PermissionGuard entity="roles" action="create">
          <button
            onClick={() => setPanelRole('new')}
            className="bg-primary text-primary-foreground border-none rounded-md px-4 py-2 text-[13px] font-bold tracking-[0.06em] uppercase cursor-pointer hover:opacity-90 transition-opacity"
          >
            + Create Role
          </button>
        </PermissionGuard>
      </div>

      <div className="flex flex-col gap-2">
        {loading ? (
          <div className="p-10 text-center font-mono text-[11px] text-muted-foreground">Loading…</div>
        ) : roles.length === 0 ? (
          <div className="p-10 text-center font-mono text-[11px] text-muted-foreground">No roles found</div>
        ) : roles.map((role) => (
          <div key={role.id} className="bg-card border border-border rounded-lg overflow-hidden">
            {/* Row header */}
            <div className="px-5 py-4 flex items-center gap-3">
              {/* Expand toggle */}
              <div
                className="flex-1 flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => setExpanded(expanded === role.id ? null : role.id)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-bold text-foreground">{role.name}</span>
                    {role.isSystem && (
                      <span className="font-mono text-[8px] tracking-[0.12em] uppercase px-1.5 py-0.5 rounded-[3px] bg-primary/12 text-primary border border-primary/25">
                        SYSTEM
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5"><MatrixPreview matrix={role.permissionMatrix} /></div>
                </div>
                <svg
                  width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"
                  className={cn('text-muted-foreground transition-transform duration-200 shrink-0', expanded === role.id ? 'rotate-180' : '')}
                >
                  <path d="M2 4l4 4 4-4" />
                </svg>
              </div>

              {/* Actions */}
              {!role.isSystem && (
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <PermissionGuard entity="roles" action="update">
                    <button
                      onClick={() => setPanelRole(role)}
                      title="Edit"
                      className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                    >
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M9.5 1.5l2 2-7 7H2.5v-2l7-7z" />
                      </svg>
                    </button>
                  </PermissionGuard>
                  <PermissionGuard entity="roles" action="delete">
                    <button
                      onClick={() => setDeleteRole(role)}
                      title="Delete"
                      className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M1.5 3.5h10M4 3.5V2h5v1.5M5 6v4M8 6v4M2 3.5l.8 7.5h7.4l.8-7.5" />
                      </svg>
                    </button>
                  </PermissionGuard>
                </div>
              )}
            </div>

            {/* Expanded read-only matrix */}
            {expanded === role.id && (
              <div className="border-t border-border px-5 py-4 bg-secondary/20">
                <MatrixEditor
                  matrix={{ ...emptyMatrix(), ...role.permissionMatrix }}
                  onChange={() => {}}
                  readonly
                />
                {!role.isSystem && (
                  <button
                    onClick={() => { setPanelRole(role); setExpanded(null); }}
                    className="mt-4 font-mono text-[9px] tracking-[0.1em] uppercase px-3 py-1.5 rounded-[4px] border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
                  >
                    Edit Permissions →
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
};

export default RolesPage;
