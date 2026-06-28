import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../db';

// ---------------------------------------------------------------------------
// Passwords — bcrypt with a cost factor of 12. Hashes are never logged or
// returned to clients.
// ---------------------------------------------------------------------------
const BCRYPT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ---------------------------------------------------------------------------
// Access tokens — short-lived JWTs carrying the user id + role.
// ---------------------------------------------------------------------------
export interface AccessClaims {
  sub: string; // user id
  role: string;
}

export function signAccessToken(userId: string, role: string): string {
  return jwt.sign({ role } satisfies Omit<AccessClaims, 'sub'>, config.jwt.accessSecret, {
    subject: userId,
    expiresIn: config.jwt.accessTtl as jwt.SignOptions['expiresIn'],
    issuer: 'my-favor',
  });
}

export function verifyAccessToken(token: string): AccessClaims {
  const payload = jwt.verify(token, config.jwt.accessSecret, { issuer: 'my-favor' });
  if (typeof payload === 'string' || !payload.sub || typeof payload.sub !== 'string') {
    throw new Error('Malformed token');
  }
  return { sub: payload.sub, role: String((payload as jwt.JwtPayload).role ?? 'member') };
}

// ---------------------------------------------------------------------------
// Refresh tokens — opaque random strings. Only a SHA-256 hash is stored, so a
// database leak does not expose usable tokens. Tokens are single-use (rotated)
// and revocable.
// ---------------------------------------------------------------------------
function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const raw = crypto.randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + config.jwt.refreshTtlDays * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
    data: { userId, tokenHash: sha256(raw), expiresAt },
  });
  return raw;
}

// Validate + rotate a refresh token. Returns the userId and a freshly issued
// token, revoking the old one. Throws on missing/expired/revoked tokens.
export async function rotateRefreshToken(raw: string): Promise<{ userId: string; token: string }> {
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) } });
  if (!record || record.revoked || record.expiresAt.getTime() < Date.now()) {
    throw new Error('Invalid refresh token');
  }
  // Rotate: revoke the presented token, mint a new one.
  await prisma.refreshToken.update({ where: { id: record.id }, data: { revoked: true } });
  const token = await issueRefreshToken(record.userId);
  return { userId: record.userId, token };
}

export async function revokeRefreshToken(raw: string): Promise<void> {
  await prisma.refreshToken
    .updateMany({ where: { tokenHash: sha256(raw) }, data: { revoked: true } })
    .catch(() => undefined);
}

export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({ where: { userId }, data: { revoked: true } });
}
