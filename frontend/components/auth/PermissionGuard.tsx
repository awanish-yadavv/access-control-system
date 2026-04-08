'use client';

import { useSession } from 'next-auth/react';
import { ReactNode } from 'react';
import { EntityName, PermissionAction } from '@/types/api.types';
import { hasPermission } from '@/lib/permissions';

interface PermissionGuardProps {
  entity: EntityName;
  action: PermissionAction;
  children: ReactNode;
  fallback?: ReactNode;
}

const PermissionGuard = ({ entity, action, children, fallback = null }: PermissionGuardProps) => {
  const { data: session } = useSession();
  const matrix = session?.user?.permissionMatrix;

  if (!hasPermission(matrix, entity, action)) return <>{fallback}</>;
  return <>{children}</>;
};

export default PermissionGuard;
