export interface APISuccess<T = unknown> {
  data: T;
  message: string;
  code: number;
}

export interface APIFailure {
  error: unknown;
  message: string;
  code: number;
}

export type UserType = 'SYSTEM' | 'TENANT' | 'CUSTOMER';

export type PermissionAction = 'create' | 'read' | 'list' | 'update' | 'delete' | 'export' | 'manage';

export type EntityName =
  | 'users' | 'roles' | 'tenants' | 'devices'
  | 'cards' | 'plans' | 'invoices' | 'subscriptions'
  | 'membership_plans' | 'customer_subscriptions' | 'customer_invoices'
  | 'access_logs';

export type EntityPermissionMatrix = {
  [entity in EntityName]?: {
    [action in PermissionAction]?: boolean;
  };
};

export interface AuthUser {
  id: string;
  email: string;
  userType: UserType;
  tenantId: string | null;
  roleId: string;
  permissionMatrix: EntityPermissionMatrix;
}
