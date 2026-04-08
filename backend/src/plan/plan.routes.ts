import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { permissionGuard } from '../middleware/permission.middleware';
import { listPlans, getPlan, createPlan, updatePlan, deletePlan } from './plan.controller';

const router = Router();

router.get('/',      authMiddleware, permissionGuard('plans', 'list'),   listPlans);
router.get('/:id',   authMiddleware, permissionGuard('plans', 'read'),   getPlan);
router.post('/',     authMiddleware, permissionGuard('plans', 'create'), createPlan);
router.patch('/:id', authMiddleware, permissionGuard('plans', 'update'), updatePlan);
router.delete('/:id',authMiddleware, permissionGuard('plans', 'delete'), deletePlan);

export default router;
