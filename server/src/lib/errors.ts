import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
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
// Distinct code so the client can route to the Account Suspended screen.
export const accountSuspended = (msg = 'This account has been suspended') =>
  new AppError(403, 'account_suspended', msg);

// A transaction that lost a concurrency race at the DATABASE level — a Postgres
// deadlock (40P01) or serialization failure (40001), or Prisma's own write-
// conflict/timeout codes (P2034). These are the DB telling us two transactions
// collided; the loser rolled back cleanly, so the right answer to the client is
// the same 409 they'd get from losing the race in application code — NOT a 500.
// Without this, a genuine double-tap (e.g. a member accepting two pal offers on
// one favor at the same instant) surfaces as "Something went wrong".
export function isTransientTxConflict(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2034: write conflict / deadlock (Prisma's mapped code). P2028: tx timeout.
    return err.code === 'P2034' || err.code === 'P2028';
  }
  // A raw Postgres deadlock/serialization error surfaces as an "unknown" Prisma
  // error whose message carries the SQLSTATE — match it there.
  const msg = (err as { message?: string } | undefined)?.message ?? '';
  return /\b40P01\b|deadlock detected|\b40001\b|could not serialize access/i.test(msg);
}

// Run a transactional claim and translate a DB-level race loss into a clean 409.
// `conflictMessage` is what the loser sees (should read like any other
// lost-the-race message on that route). Application-level AppErrors thrown
// inside the callback (the normal "this favor is no longer available" gates)
// propagate unchanged — only true DB write-conflicts are rewritten.
export async function runClaimTx<T>(
  tx: () => Promise<T>,
  conflictMessage: string,
): Promise<T> {
  try {
    return await tx();
  } catch (err) {
    if (isTransientTxConflict(err)) throw conflict(conflictMessage);
    throw err;
  }
}

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
