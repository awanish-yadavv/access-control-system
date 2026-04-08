import { Response } from 'express';
import { APISuccess, APIFailure } from '../types/api.types';

export function apiSuccess<T>(
  res: Response,
  data: T,
  message = 'Success',
  code = 200,
): Response {
  const body: APISuccess<T> = { data, message, code };
  return res.status(code).json(body);
}

export function apiError(
  res: Response,
  error: unknown,
  message = 'An error occurred',
  code = 500,
): Response {
  const body: APIFailure = { error, message, code };
  return res.status(code).json(body);
}
