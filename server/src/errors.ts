import type { ErrorRequestHandler, Request, Response, NextFunction } from 'express';
import { ZodError, type ZodType } from 'zod';
import type { ApiError } from './types';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = 'REQUEST_FAILED') {
    super(message);
    this.name = 'HttpError';
  }
}

export function validate<T>(schema: ZodType<T>, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new HttpError(400, error.issues[0]?.message ?? 'Please check the submitted information.', 'VALIDATION_ERROR');
    }
    throw error;
  }
}

export function requireId(value: string | string[] | undefined, label = 'item'): string {
  if (!value || Array.isArray(value) || value.length > 160) throw new HttpError(400, `A valid ${label} is required.`, 'INVALID_ID');
  return value;
}

export function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => Promise.resolve(handler(req, res, next)).catch(next);
}

export const errorHandler: ErrorRequestHandler = (error: ApiError, _req, res, _next) => {
  if (res.headersSent) return;
  const status = error.status && error.status >= 400 && error.status < 600 ? error.status : 500;
  if (status >= 500) console.error('Request failed:', error.message);
  res.status(status).json({
    error: status >= 500 ? 'Something went wrong. Please try again.' : error.message,
    code: error.code ?? (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED')
  });
};
