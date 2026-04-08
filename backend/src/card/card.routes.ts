import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { permissionGuard } from '../middleware/permission.middleware';
import { listCards, getCard, createCard, updateCard, deleteCard, assignCard } from './card.controller';

const router = Router();

router.get('/', authMiddleware, permissionGuard('cards', 'list'), listCards);
router.get('/:id', authMiddleware, permissionGuard('cards', 'read'), getCard);
router.post('/', authMiddleware, permissionGuard('cards', 'create'), createCard);
router.patch('/:id', authMiddleware, permissionGuard('cards', 'update'), updateCard);
router.delete('/:id', authMiddleware, permissionGuard('cards', 'delete'), deleteCard);
router.post('/:id/assign', authMiddleware, permissionGuard('cards', 'manage'), assignCard);

export default router;
