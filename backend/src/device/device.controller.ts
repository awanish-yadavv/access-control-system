import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { Device } from './device.entity';
import { Tenant } from '../tenant/tenant.entity';
import { assignDeviceToTenant } from '../service/tenant-schema.service';
import { apiSuccess, apiError } from '../utils/response';
import { param } from '../utils/params';

const repo = () => AppDataSource.getRepository(Device);

export const listDevices = async (req: Request, res: Response): Promise<void> => {
  const caller = req.user!;
  const where = caller.userType === 'SYSTEM' ? {} : { tenantId: caller.tenantId ?? undefined };
  apiSuccess(res, await repo().find({ where, relations: ['tenant'] }), 'Devices fetched', 200);
};

export const getDevice = async (req: Request, res: Response): Promise<void> => {
  const device = await repo().findOne({ where: { id: param(req, 'id') } });
  if (!device) { apiError(res, null, 'Device not found', 404); return; }
  apiSuccess(res, device, 'Device fetched', 200);
};

export const createDevice = async (req: Request, res: Response): Promise<void> => {
  const { macAddress, name } = req.body;
  if (!macAddress) { apiError(res, null, 'macAddress is required', 400); return; }
  const mac = macAddress.toUpperCase();
  const existing = await repo().findOne({ where: { macAddress: mac } });
  if (existing) { apiError(res, null, 'Device with this MAC already exists', 409); return; }
  const device = repo().create({ macAddress: mac, name: name ?? null });
  await repo().save(device);
  apiSuccess(res, device, 'Device created', 201);
};

export const updateDevice = async (req: Request, res: Response): Promise<void> => {
  const device = await repo().findOne({ where: { id: param(req, 'id') } });
  if (!device) { apiError(res, null, 'Device not found', 404); return; }
  if (req.body.name !== undefined) device.name = req.body.name;
  if (req.body.publicKey !== undefined) {
    const pem: string | null = req.body.publicKey;
    if (pem && !pem.includes('-----BEGIN PUBLIC KEY-----')) {
      apiError(res, null, 'publicKey must be a PEM-encoded RSA public key (-----BEGIN PUBLIC KEY-----)', 400);
      return;
    }
    device.publicKey = pem || null;
  }
  await repo().save(device);
  apiSuccess(res, device, 'Device updated', 200);
};

export const deleteDevice = async (req: Request, res: Response): Promise<void> => {
  const device = await repo().findOne({ where: { id: param(req, 'id') } });
  if (!device) { apiError(res, null, 'Device not found', 404); return; }
  await repo().remove(device);
  apiSuccess(res, null, 'Device deleted', 200);
};

export const assignDevice = async (req: Request, res: Response): Promise<void> => {
  const { tenantId, label } = req.body;
  const device = await repo().findOne({ where: { id: param(req, 'id') } });
  if (!device) { apiError(res, null, 'Device not found', 404); return; }
  const tenant = await AppDataSource.getRepository(Tenant).findOne({ where: { id: tenantId } });
  if (!tenant) { apiError(res, null, 'Tenant not found', 404); return; }
  device.tenantId = tenantId;
  await repo().save(device);
  await assignDeviceToTenant(tenantId, device.id, label);
  apiSuccess(res, device, 'Device assigned to tenant', 200);
};
