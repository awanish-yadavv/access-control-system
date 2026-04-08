import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { permissionGuard } from '../middleware/permission.middleware';
import { listDevices, getDevice, createDevice, updateDevice, deleteDevice, assignDevice } from './device.controller';

const router = Router();

router.get('/',           authMiddleware, permissionGuard('devices', 'list'),   listDevices);
router.get('/:id',        authMiddleware, permissionGuard('devices', 'read'),   getDevice);
router.post('/',          authMiddleware, permissionGuard('devices', 'create'), createDevice);
router.patch('/:id',      authMiddleware, permissionGuard('devices', 'update'), updateDevice);
router.delete('/:id',     authMiddleware, permissionGuard('devices', 'delete'), deleteDevice);
router.post('/:id/assign',authMiddleware, permissionGuard('devices', 'manage'), assignDevice);

export default router;
