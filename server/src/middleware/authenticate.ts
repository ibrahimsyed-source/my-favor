import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/auth';
import { unauthorized, forbidden, accountSuspended } from '../lib/errors';
import { prisma } from '../db';

// Augment Express's Request with the authenticated principal.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; role: string };
    }
  }
}

// Requires a valid Bearer access token. Populates req.user. We also confirm the
// user still exists (covers deleted accounts whose tokens haven't expired yet).
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.header('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw unauthorized();

    let claims;
    try {
      claims = verifyAccessToken(token);
    } catch {
      throw unauthorized('Invalid or expired token');
    }

    const user = await prisma.user.findUnique({ where: { id: claims.sub }, select: { id: true, role: true, suspended: true } });
    if (!user) throw unauthorized('Account no longer exists');
    // A suspended account is cut off mid-session (distinct code so the client
    // can show the Account Suspended screen).
    if (user.suspended) throw accountSuspended();

    req.user = { id: user.id, role: user.role };
    next();
  } catch (err) {
    next(err);
  }
}

// Restrict a route to a specific role (uses the live DB role from authenticate).
export function requireRole(role: 'member' | 'pal') {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (req.user.role !== role) {
      return next(forbidden(`This action is only available to ${role}s`));
    }
    next();
  };
}
