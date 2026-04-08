import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { permissionGuard } from '../middleware/permission.middleware';
import { listUsers, getUser, createUser, updateUser, deleteUser, assignRoles } from './user.controller';

const router = Router();

router.get('/',     authMiddleware, permissionGuard('users', 'list'),   listUsers);
router.get('/:id',  authMiddleware, permissionGuard('users', 'read'),   getUser);
router.post('/',    authMiddleware, permissionGuard('users', 'create'),  createUser);
router.patch('/:id',authMiddleware, permissionGuard('users', 'update'),  updateUser);
router.delete('/:id',      authMiddleware, permissionGuard('users', 'delete'), deleteUser);
router.patch('/:id/roles', authMiddleware, permissionGuard('users', 'update'), assignRoles);

export default router;
