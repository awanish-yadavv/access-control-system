import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../data-source';
import { Role } from '../role/role.entity';
import { EntityName, PermissionAction } from '../types/permission.types';
import { apiError } from '../utils/response';

// Simple in-memory LRU-style cache keyed by roleId
const roleCache = new Map<string, { matrix: Role['permissionMatrix']; ts: number }>();
const CACHE_TTL_MS = 60_000; // 1 minute

async function getRoleMatrix(roleId: string) {
  const cached = roleCache.get(roleId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.matrix;

  const role = await AppDataSource.getRepository(Role).findOne({ where: { id: roleId } });
  if (!role) return null;

  roleCache.set(roleId, { matrix: role.permissionMatrix, ts: Date.now() });
  return role.permissionMatrix;
}

export function permissionGuard(entity: EntityName, action: PermissionAction) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.user;
    if (!user) {
      apiError(res, null, 'Unauthorized', 401);
      return;
    }

    if (!user.roleId) {
      apiError(res, null, 'No role assigned', 403);
      return;
    }

    const matrix = await getRoleMatrix(user.roleId);
    if (!matrix) {
      apiError(res, null, 'Role not found', 403);
      return;
    }

    if (matrix[entity]?.[action] !== true) {
      apiError(res, null, `Permission denied: ${entity}.${action}`, 403);
      return;
    }

    next();
  };
}
