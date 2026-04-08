import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../service/jwt.service';
import { apiError } from '../utils/response';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    apiError(res, null, 'Missing or invalid Authorization header', 401);
    return;
  }

  const token = header.slice(7);
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    apiError(res, null, 'Invalid or expired access token', 401);
  }
}
