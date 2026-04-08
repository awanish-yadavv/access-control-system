import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { Plan } from './plan.entity';
import { apiSuccess, apiError } from '../utils/response';
import { param } from '../utils/params';

const repo = () => AppDataSource.getRepository(Plan);

export const listPlans = async (_req: Request, res: Response): Promise<void> => {
  apiSuccess(res, await repo().find(), 'Plans fetched', 200);
};

export const getPlan = async (req: Request, res: Response): Promise<void> => {
  const plan = await repo().findOne({ where: { id: param(req, 'id') } });
  if (!plan) { apiError(res, null, 'Plan not found', 404); return; }
  apiSuccess(res, plan, 'Plan fetched', 200);
};

export const createPlan = async (req: Request, res: Response): Promise<void> => {
  const { name, price, features } = req.body;
  if (!name || price === undefined) { apiError(res, null, 'name and price are required', 400); return; }
  const plan = repo().create({ name, price, features: features ?? {} });
  await repo().save(plan);
  apiSuccess(res, plan, 'Plan created', 201);
};

export const updatePlan = async (req: Request, res: Response): Promise<void> => {
  const plan = await repo().findOne({ where: { id: param(req, 'id') } });
  if (!plan) { apiError(res, null, 'Plan not found', 404); return; }
  const { name, price, features } = req.body;
  if (name !== undefined)     plan.name     = name;
  if (price !== undefined)    plan.price    = price;
  if (features !== undefined) plan.features = features;
  await repo().save(plan);
  apiSuccess(res, plan, 'Plan updated', 200);
};

export const deletePlan = async (req: Request, res: Response): Promise<void> => {
  const plan = await repo().findOne({ where: { id: param(req, 'id') } });
  if (!plan) { apiError(res, null, 'Plan not found', 404); return; }
  await repo().remove(plan);
  apiSuccess(res, null, 'Plan deleted', 200);
};
