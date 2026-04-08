export type PermissionAction = 'create' | 'read' | 'list' | 'update' | 'delete' | 'export' | 'manage';

export type EntityName =
  | 'users'
  | 'roles'
  | 'tenants'
  | 'devices'
  | 'cards'
  | 'plans'
  | 'invoices'
  | 'subscriptions'
  | 'membership_plans'
  | 'customer_subscriptions'
  | 'customer_invoices'
  | 'access_logs'
  | 'settings';

export type EntityPermissionMatrix = {
  [entity in EntityName]?: {
    [action in PermissionAction]?: boolean;
  };
};
