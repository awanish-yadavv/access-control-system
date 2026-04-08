import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { permissionGuard } from '../middleware/permission.middleware';
import { listRoles, getRole, createRole, updateRole, deleteRole } from './role.controller';

const router = Router();

router.get('/',      authMiddleware, permissionGuard('roles', 'list'),   listRoles);
router.get('/:id',   authMiddleware, permissionGuard('roles', 'read'),   getRole);
router.post('/',     authMiddleware, permissionGuard('roles', 'create'),  createRole);
router.patch('/:id', authMiddleware, permissionGuard('roles', 'update'),  updateRole);
router.delete('/:id',authMiddleware, permissionGuard('roles', 'delete'),  deleteRole);

export default router;
