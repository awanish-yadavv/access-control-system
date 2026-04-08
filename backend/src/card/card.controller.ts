import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { Card } from './card.entity';
import { assignCardToTenant } from '../service/tenant-schema.service';
import { apiSuccess, apiError } from '../utils/response';
import { param } from '../utils/params';

const repo = () => AppDataSource.getRepository(Card);

export const listCards = async (req: Request, res: Response): Promise<void> => {
  const caller = req.user!;
  const where = caller.userType === 'SYSTEM' ? {} : { tenantId: caller.tenantId ?? undefined };
  apiSuccess(res, await repo().find({ where, relations: ['tenant', 'assignedTo'] }), 'Cards fetched', 200);
};

export const getCard = async (req: Request, res: Response): Promise<void> => {
  const card = await repo().findOne({ where: { id: param(req, 'id') } });
  if (!card) { apiError(res, null, 'Card not found', 404); return; }
  apiSuccess(res, card, 'Card fetched', 200);
};

export const createCard = async (req: Request, res: Response): Promise<void> => {
  const { uid } = req.body;
  if (!uid) { apiError(res, null, 'uid is required', 400); return; }
  const uidUpper = uid.toUpperCase();
  const existing = await repo().findOne({ where: { uid: uidUpper } });
  if (existing) { apiError(res, null, 'Card UID already exists', 409); return; }
  const card = repo().create({ uid: uidUpper });
  await repo().save(card);
  apiSuccess(res, card, 'Card created', 201);
};

export const updateCard = async (req: Request, res: Response): Promise<void> => {
  const card = await repo().findOne({ where: { id: param(req, 'id') } });
  if (!card) { apiError(res, null, 'Card not found', 404); return; }
  if (req.body.status) card.status = req.body.status;
  await repo().save(card);
  apiSuccess(res, card, 'Card updated', 200);
};

export const deleteCard = async (req: Request, res: Response): Promise<void> => {
  const card = await repo().findOne({ where: { id: param(req, 'id') } });
  if (!card) { apiError(res, null, 'Card not found', 404); return; }
  await repo().remove(card);
  apiSuccess(res, null, 'Card deleted', 200);
};

export const assignCard = async (req: Request, res: Response): Promise<void> => {
  const { tenantId, customerId, label } = req.body;
  const card = await repo().findOne({ where: { id: param(req, 'id') } });
  if (!card) { apiError(res, null, 'Card not found', 404); return; }
  card.tenantId    = tenantId     ?? card.tenantId;
  card.assignedToId = customerId  ?? card.assignedToId;
  await repo().save(card);
  if (tenantId) await assignCardToTenant(tenantId, card.id, customerId, label);
  apiSuccess(res, card, 'Card assigned', 200);
};
