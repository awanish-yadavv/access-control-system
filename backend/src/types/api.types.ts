export interface APISuccess<T = unknown> {
  data: T;
  message: string;
  code: number;
}

export interface APIFailure {
  error: unknown;
  message: string;
  code: number;
}

export type UserType = 'SYSTEM' | 'TENANT' | 'CUSTOMER';

export interface JWTPayload {
  userId: string;
  userType: UserType;
  tenantId: string | null;
  roleId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}
