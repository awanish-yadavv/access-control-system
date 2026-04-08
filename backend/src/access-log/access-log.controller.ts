import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { AccessLog } from './access-log.entity';
import { apiSuccess } from '../utils/response';
import { param } from '../utils/params';
import { Between, FindOptionsWhere } from 'typeorm';

const repo = () => AppDataSource.getRepository(AccessLog);

export const listAccessLogs = async (req: Request, res: Response): Promise<void> => {
  const caller = req.user!;
  const { deviceId, result, from, to, limit = '50', offset = '0' } = req.query as Record<string, string>;

  const where: FindOptionsWhere<AccessLog> = {};
  if (caller.userType !== 'SYSTEM') where.tenantId = caller.tenantId ?? undefined;
  if (deviceId) where.deviceId = deviceId;
  if (result === 'granted' || result === 'denied') where.result = result;
  if (from && to) where.timestamp = Between(new Date(from), new Date(to));

  const [logs, total] = await repo().findAndCount({
    where,
    order: { timestamp: 'DESC' },
    take: Math.min(parseInt(limit, 10), 200),
    skip: parseInt(offset, 10),
    relations: ['device', 'tenant', 'user'],
  });

  apiSuccess(res, { logs, total }, 'Access logs fetched', 200);
};

export const getAccessLog = async (req: Request, res: Response): Promise<void> => {
  const log = await repo().findOne({
    where: { id: param(req, 'id') },
    relations: ['device', 'tenant', 'user'],
  });
  apiSuccess(res, log ?? null, log ? 'Access log fetched' : 'Log not found', log ? 200 : 404);
};
