import { Request, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { AppDataSource } from '../data-source';
import { User } from '../user/user.entity';
import { RefreshToken } from './refresh-token.entity';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../service/jwt.service';
import { apiSuccess, apiError } from '../utils/response';

const userRepo  = () => AppDataSource.getRepository(User);
const tokenRepo = () => AppDataSource.getRepository(RefreshToken);

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;
  if (!email || !password) { apiError(res, null, 'Email and password are required', 400); return; }

  const user = await userRepo().findOne({ where: { email }, relations: ['roles'] });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    apiError(res, null, 'Invalid credentials', 401); return;
  }

  const roleId      = user.roles?.[0]?.id ?? '';
  const accessToken = signAccessToken({ userId: user.id, userType: user.userType, tenantId: user.tenantId, roleId });
  const refreshRaw  = signRefreshToken(user.id);
  const tokenHash   = crypto.createHash('sha256').update(refreshRaw).digest('hex');
  const expiresAt   = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await tokenRepo().save(tokenRepo().create({ userId: user.id, tokenHash, expiresAt }));

  apiSuccess(res, {
    accessToken,
    refreshToken: refreshRaw,
    user: {
      id: user.id,
      email: user.email,
      userType: user.userType,
      tenantId: user.tenantId,
      roleId,
      permissionMatrix: user.roles?.[0]?.permissionMatrix ?? {},
    },
  }, 'Login successful', 200);
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body;
  if (!refreshToken) { apiError(res, null, 'Refresh token required', 400); return; }

  let userId: string;
  try {
    ({ userId } = verifyRefreshToken(refreshToken));
  } catch {
    apiError(res, null, 'Invalid or expired refresh token', 401); return;
  }

  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const stored    = await tokenRepo().findOne({ where: { tokenHash, userId } });
  if (!stored || stored.expiresAt < new Date()) {
    apiError(res, null, 'Refresh token not found or expired', 401); return;
  }

  const user = await userRepo().findOne({ where: { id: userId }, relations: ['roles'] });
  if (!user) { apiError(res, null, 'User not found', 401); return; }

  const roleId      = user.roles?.[0]?.id ?? '';
  const accessToken = signAccessToken({ userId: user.id, userType: user.userType, tenantId: user.tenantId, roleId });
  apiSuccess(res, { accessToken }, 'Token refreshed', 200);
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await tokenRepo().delete({ tokenHash });
  }
  apiSuccess(res, null, 'Logged out successfully', 200);
};
