import { Request, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import { In } from 'typeorm';
import { AppDataSource } from '../data-source';
import { User } from './user.entity';
import { Role } from '../role/role.entity';
import { apiSuccess, apiError } from '../utils/response';
import { param } from '../utils/params';
import { UserType } from '../types/api.types';

const repo = () => AppDataSource.getRepository(User);

const safeUser = (u: User) => {
  const { passwordHash: _, ...rest } = u as User & { passwordHash: string };
  return rest;
};

const canAccess = (caller: NonNullable<Request['user']>, target: User): boolean => {
  if (caller.userType === 'SYSTEM') return true;
  if (caller.userType === 'TENANT') return target.tenantId === caller.tenantId;
  return target.id === caller.userId;
};

export const listUsers = async (req: Request, res: Response): Promise<void> => {
  const caller = req.user!;
  const where = caller.userType === 'SYSTEM' ? {} : { tenantId: caller.tenantId ?? undefined };
  const users = await repo().find({ where, relations: ['roles'] });
  apiSuccess(res, users.map(safeUser), 'Users fetched', 200);
};

export const getUser = async (req: Request, res: Response): Promise<void> => {
  const user = await repo().findOne({ where: { id: param(req, 'id') }, relations: ['roles'] });
  if (!user) { apiError(res, null, 'User not found', 404); return; }
  if (!canAccess(req.user!, user)) { apiError(res, null, 'Access denied', 403); return; }
  apiSuccess(res, safeUser(user), 'User fetched', 200);
};

export const createUser = async (req: Request, res: Response): Promise<void> => {
  const { email, password, userType, tenantId } = req.body;
  if (!email || !password || !userType) {
    apiError(res, null, 'email, password and userType are required', 400); return;
  }
  const existing = await repo().findOne({ where: { email } });
  if (existing) { apiError(res, null, 'Email already in use', 409); return; }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = repo().create({ email, passwordHash, userType: userType as UserType, tenantId: tenantId ?? null });
  await repo().save(user);
  apiSuccess(res, safeUser(user), 'User created', 201);
};

export const updateUser = async (req: Request, res: Response): Promise<void> => {
  const user = await repo().findOne({ where: { id: param(req, 'id') } });
  if (!user) { apiError(res, null, 'User not found', 404); return; }
  if (!canAccess(req.user!, user)) { apiError(res, null, 'Access denied', 403); return; }
  const { email, password, userType, tenantId } = req.body;
  if (email)    user.email    = email;
  if (password) user.passwordHash = await bcrypt.hash(password, 12);
  if (userType && req.user!.userType === 'SYSTEM') user.userType = userType;
  if (tenantId !== undefined && req.user!.userType === 'SYSTEM') user.tenantId = tenantId;
  await repo().save(user);
  apiSuccess(res, safeUser(user), 'User updated', 200);
};

export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  const user = await repo().findOne({ where: { id: param(req, 'id') } });
  if (!user) { apiError(res, null, 'User not found', 404); return; }
  await repo().remove(user);
  apiSuccess(res, null, 'User deleted', 200);
};

export const assignRoles = async (req: Request, res: Response): Promise<void> => {
  const { roleIds } = req.body;
  if (!Array.isArray(roleIds)) { apiError(res, null, 'roleIds must be an array', 400); return; }
  const user = await repo().findOne({ where: { id: param(req, 'id') }, relations: ['roles'] });
  if (!user) { apiError(res, null, 'User not found', 404); return; }
  const roleRepo = AppDataSource.getRepository(Role);
  user.roles = roleIds.length > 0 ? await roleRepo.findBy({ id: In(roleIds) }) : [];
  await repo().save(user);
  apiSuccess(res, safeUser(user), 'Roles assigned', 200);
};
