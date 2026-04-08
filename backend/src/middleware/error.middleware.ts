import { Request, Response, NextFunction } from 'express';
import { APIFailure } from '../types/api.types';

export function errorMiddleware(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error(`[Error] ${err.message}`, err.stack);

  const body: APIFailure = {
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    message: err.message || 'An unexpected error occurred',
    code: 500,
  };

  res.status(500).json(body);
}
