import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { Role } from './role.entity';
import { apiSuccess, apiError } from '../utils/response';
import { param } from '../utils/params';

const repo = () => AppDataSource.getRepository(Role);

export const listRoles = async (_req: Request, res: Response): Promise<void> => {
  apiSuccess(res, await repo().find(), 'Roles fetched', 200);
};

export const getRole = async (req: Request, res: Response): Promise<void> => {
  const role = await repo().findOne({ where: { id: param(req, 'id') } });
  if (!role) { apiError(res, null, 'Role not found', 404); return; }
  apiSuccess(res, role, 'Role fetched', 200);
};

export const createRole = async (req: Request, res: Response): Promise<void> => {
  const { name, permissionMatrix } = req.body;
  if (!name) { apiError(res, null, 'name is required', 400); return; }
  const existing = await repo().findOne({ where: { name } });
  if (existing) { apiError(res, null, 'Role name already exists', 409); return; }
  const role = repo().create({ name, permissionMatrix: permissionMatrix ?? {} });
  await repo().save(role);
  apiSuccess(res, role, 'Role created', 201);
};

export const updateRole = async (req: Request, res: Response): Promise<void> => {
  const role = await repo().findOne({ where: { id: param(req, 'id') } });
  if (!role) { apiError(res, null, 'Role not found', 404); return; }
  if (role.isSystem) { apiError(res, null, 'System roles cannot be modified', 403); return; }
  const { name, permissionMatrix } = req.body;
  if (name) role.name = name;
  if (permissionMatrix) role.permissionMatrix = permissionMatrix;
  await repo().save(role);
  apiSuccess(res, role, 'Role updated', 200);
};

export const deleteRole = async (req: Request, res: Response): Promise<void> => {
  const role = await repo().findOne({ where: { id: param(req, 'id') } });
  if (!role) { apiError(res, null, 'Role not found', 404); return; }
  if (role.isSystem) { apiError(res, null, 'System roles cannot be deleted', 403); return; }
  await repo().remove(role);
  apiSuccess(res, null, 'Role deleted', 200);
};
