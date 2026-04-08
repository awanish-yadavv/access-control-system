import { Request } from 'express';

/** Safely extract a route param as string */
export function param(req: Request, name: string): string {
  const val = req.params[name];
  return Array.isArray(val) ? val[0]! : val as string;
}
