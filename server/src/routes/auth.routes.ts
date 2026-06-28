import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { validate } from '../lib/validate';
import { asyncHandler, badRequest, conflict, unauthorized, forbidden } from '../lib/errors';
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
} from '../lib/auth';
import { issueOtp, verifyOtp } from '../lib/otp';
import { publicUser } from '../lib/serialize';
import { authenticate } from '../middleware/authenticate';
import { authLimiter, otpLimiter } from '../middleware/rateLimit';

export const authRouter = Router();

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(200);

const signupSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
  phone: z.string().trim().min(7).max(32),
  password: passwordSchema,
  role: z.enum(['member', 'pal']).optional(),
});

async function issueSession(userId: string, role: string) {
  const accessToken = signAccessToken(userId, role);
  const refreshToken = await issueRefreshToken(userId);
  return { accessToken, refreshToken };
}

// POST /api/auth/signup — creates an unverified account and sends an OTP.
authRouter.post(
  '/signup',
  authLimiter,
  validate({ body: signupSchema }),
  asyncHandler(async (req, res) => {
    const { firstName, lastName, email, phone, password, role } = req.body as z.infer<typeof signupSchema>;

    const passwordHash = await hashPassword(password);
    let user;
    try {
      user = await prisma.user.create({
        data: { firstName, lastName, email, phone, passwordHash, role: role ?? 'member' },
      });
    } catch (err) {
      // Unique constraint (email or phone already registered).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw conflict('An account with that email or phone already exists');
      }
      throw err;
    }

    const otp = await issueOtp({ destination: email, purpose: 'signup', userId: user.id });
    res.status(201).json({ userId: user.id, destination: email, otpSent: true, ...otp });
  }),
);

// POST /api/auth/verify-otp — confirms a signup code, verifies the account, and
// returns a session.
const verifyOtpSchema = z.object({
  destination: z.string().trim().toLowerCase().min(3).max(200),
  code: z.string().trim().regex(/^\d{6}$/, 'Code must be 6 digits'),
});
authRouter.post(
  '/verify-otp',
  authLimiter,
  validate({ body: verifyOtpSchema }),
  asyncHandler(async (req, res) => {
    const { destination, code } = req.body as z.infer<typeof verifyOtpSchema>;
    const result = await verifyOtp({ destination, purpose: 'signup', code });
    if (!result.ok) throw badRequest('Invalid or expired code');

    const user = await prisma.user.update({
      where: { email: destination },
      data: { verified: true },
    });

    const session = await issueSession(user.id, user.role);
    res.json({ user: publicUser(user), ...session });
  }),
);

// POST /api/auth/resend-otp — re-sends a code. Always responds generically so it
// cannot be used to probe which emails are registered.
const resendSchema = z.object({
  destination: z.string().trim().toLowerCase().min(3).max(200),
  purpose: z.enum(['signup', 'login', 'reset']).default('signup'),
});
authRouter.post(
  '/resend-otp',
  otpLimiter,
  validate({ body: resendSchema }),
  asyncHandler(async (req, res) => {
    const { destination, purpose } = req.body as z.infer<typeof resendSchema>;
    const user = await prisma.user.findUnique({ where: { email: destination } });
    let devCode;
    // Only (re)issue a signup code for accounts that still need verification.
    // This stops OTP from becoming a passwordless login for an already-verified
    // account (a code-resend + brute-force account-takeover vector).
    if (user && !user.verified && purpose === 'signup') {
      const otp = await issueOtp({ destination, purpose, userId: user.id });
      devCode = otp.devCode;
    } else {
      // Do equivalent work (a bcrypt hash) when we don't issue a code so the
      // response time can't reveal whether the account exists / is verified.
      await bcrypt.hash(destination, 10);
    }
    // Generic response regardless of whether the account exists.
    res.json({ otpSent: true, ...(devCode ? { devCode } : {}) });
  }),
);

// POST /api/auth/login — password login. Returns a session for verified users.
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});
authRouter.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const user = await prisma.user.findUnique({ where: { email } });

    // Constant-ish work + generic message to avoid user enumeration / timing.
    const ok = user ? await verifyPassword(password, user.passwordHash) : await verifyPassword(password, DUMMY_HASH);
    if (!user || !ok) throw unauthorized('Invalid email or password');

    if (!user.verified) {
      await issueOtp({ destination: user.email, purpose: 'signup', userId: user.id });
      throw forbidden('Account not verified — we sent you a new code');
    }

    const session = await issueSession(user.id, user.role);
    res.json({ user: publicUser(user), ...session });
  }),
);

// POST /api/auth/refresh — rotate a refresh token for a new session.
const refreshSchema = z.object({ refreshToken: z.string().min(10).max(500) });
authRouter.post(
  '/refresh',
  validate({ body: refreshSchema }),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body as z.infer<typeof refreshSchema>;
    let rotated;
    try {
      rotated = await rotateRefreshToken(refreshToken);
    } catch {
      throw unauthorized('Invalid refresh token');
    }
    const user = await prisma.user.findUnique({ where: { id: rotated.userId } });
    if (!user) throw unauthorized('Account no longer exists');
    const accessToken = signAccessToken(user.id, user.role);
    res.json({ accessToken, refreshToken: rotated.token });
  }),
);

// POST /api/auth/logout — revoke a refresh token.
authRouter.post(
  '/logout',
  validate({ body: refreshSchema }),
  asyncHandler(async (req, res) => {
    await revokeRefreshToken((req.body as z.infer<typeof refreshSchema>).refreshToken);
    res.json({ ok: true });
  }),
);

// POST /api/auth/change-password — (auth) verify current, set new, revoke other sessions.
const changePwSchema = z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema });
authRouter.post(
  '/change-password',
  authenticate,
  validate({ body: changePwSchema }),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body as z.infer<typeof changePwSchema>;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw badRequest('Current password is incorrect');
    }
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } });
    await revokeAllRefreshTokens(user.id); // force re-login on other devices
    res.json({ ok: true });
  }),
);

// DELETE /api/auth/account — (auth) permanently delete the account + all data.
// Satisfies App Store guideline 5.1.1(v). Cascades remove every owned row.
authRouter.delete(
  '/account',
  authenticate,
  asyncHandler(async (req, res) => {
    await prisma.user.delete({ where: { id: req.user!.id } });
    res.json({ ok: true, deleted: true });
  }),
);

// A valid bcrypt hash of a random value, compared against when no user is found
// so login timing doesn't reveal whether an email exists.
const DUMMY_HASH = bcrypt.hashSync('login-timing-equalizer', 12);
