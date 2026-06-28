import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { config } from '../config';

// Typed application error. `expose: true` means the message is safe to show the
// client; otherwise a generic message is returned so we never leak internals.
export class AppError extends Error {
  status: number;
  code: string;
  expose: boolean;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.expose = status < 500;
    this.details = details;
  }
}

export const badRequest = (msg: string, details?: unknown) => new AppError(400, 'bad_request', msg, details);
export const unauthorized = (msg = 'Authentication required') => new AppError(401, 'unauthorized', msg);
export const forbidden = (msg = 'You do not have access to this resource') => new AppError(403, 'forbidden', msg);
export const notFound = (msg = 'Not found') => new AppError(404, 'not_found', msg);
export const conflict = (msg: string) => new AppError(409, 'conflict', msg);
export const tooMany = (msg = 'Too many requests') => new AppError(429, 'too_many_requests', msg);

// Wrap async route handlers so thrown/rejected errors reach the error middleware.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// Centralized error responder. Crucially, it does NOT leak stack traces or
// internal error messages for 5xx errors in any environment.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { code: 'validation_error', message: 'Invalid request', details: err.issues },
    });
  }

  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: err.expose ? err.message : 'Something went wrong',
        ...(err.expose && err.details ? { details: err.details } : {}),
      },
    });
  }

  // Unknown / unexpected error: log server-side, return an opaque message.
  // eslint-disable-next-line no-console
  console.error('Unhandled error:', err);
  return res.status(500).json({
    error: { code: 'internal_error', message: 'Something went wrong' },
    ...(config.isProd ? {} : { debug: String((err as Error)?.message ?? err) }),
  });
}
