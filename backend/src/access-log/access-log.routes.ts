import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { permissionGuard } from '../middleware/permission.middleware';
import { listAccessLogs, getAccessLog } from './access-log.controller';

const router = Router();

router.get('/',    authMiddleware, permissionGuard('access_logs', 'list'), listAccessLogs);
router.get('/:id', authMiddleware, permissionGuard('access_logs', 'read'), getAccessLog);

export default router;
