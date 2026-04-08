import { Router } from 'express';
import authRoutes       from './auth/auth.routes';
import userRoutes       from './user/user.routes';
import roleRoutes       from './role/role.routes';
import tenantRoutes     from './tenant/tenant.routes';
import deviceRoutes     from './device/device.routes';
import cardRoutes       from './card/card.routes';
import accessLogRoutes  from './access-log/access-log.routes';
import planRoutes       from './plan/plan.routes';

const router = Router();

router.use('/auth',        authRoutes);
router.use('/users',       userRoutes);
router.use('/roles',       roleRoutes);
router.use('/tenants',     tenantRoutes);
router.use('/devices',     deviceRoutes);
router.use('/cards',       cardRoutes);
router.use('/access-logs', accessLogRoutes);
router.use('/plans',       planRoutes);

export default router;
