import { EntityPermissionMatrix, EntityName, PermissionAction } from '@/types/api.types';

export const hasPermission = (
  matrix: EntityPermissionMatrix | undefined | null,
  entity: EntityName,
  action: PermissionAction,
): boolean => {
  if (!matrix) return false;
  return matrix[entity]?.[action] === true;
};
