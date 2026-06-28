import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config';
import { prisma } from '../db';

// ---------------------------------------------------------------------------
// One-time codes for phone/email verification. The raw code is hashed (bcrypt)
// before storage, codes expire quickly, are single-use, and are throttled by an
// attempt counter to prevent brute force. In development the code is returned to
// the caller so you can test without a real SMS provider; in production this is
// disabled (OTP_DEV_RETURN=false) and you wire Twilio/email in `dispatch`.
// ---------------------------------------------------------------------------
const MAX_ATTEMPTS = 5;

function generateCode(): string {
  // 6-digit numeric, cryptographically random, no modulo bias.
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export interface IssuedOtp {
  /** Present only in development (OTP_DEV_RETURN=true) for testing. */
  devCode?: string;
}

export async function issueOtp(opts: {
  destination: string;
  purpose: 'signup' | 'login' | 'reset';
  userId?: string;
}): Promise<IssuedOtp> {
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + config.otp.ttlMinutes * 60 * 1000);

  // Invalidate any prior unconsumed codes for this destination+purpose.
  await prisma.otpCode.updateMany({
    where: { destination: opts.destination, purpose: opts.purpose, consumed: false },
    data: { consumed: true },
  });

  await prisma.otpCode.create({
    data: {
      destination: opts.destination,
      purpose: opts.purpose,
      userId: opts.userId,
      codeHash,
      expiresAt,
    },
  });

  await dispatch(opts.destination, code);

  return config.otp.devReturn ? { devCode: code } : {};
}

// Verify a submitted code. Returns the userId tied to the code (if any) on
// success. Enforces expiry, single-use, and an attempt cap.
export async function verifyOtp(opts: {
  destination: string;
  purpose: 'signup' | 'login' | 'reset';
  code: string;
}): Promise<{ ok: boolean; userId?: string | null }> {
  const record = await prisma.otpCode.findFirst({
    where: { destination: opts.destination, purpose: opts.purpose, consumed: false },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) return { ok: false };
  if (record.expiresAt.getTime() < Date.now()) {
    await prisma.otpCode.update({ where: { id: record.id }, data: { consumed: true } });
    return { ok: false };
  }

  // Atomically consume one attempt; if the row is already at/over the cap (or
  // consumed) this updates 0 rows and we reject. This closes the read-then-
  // increment TOCTOU where concurrent requests could exceed MAX_ATTEMPTS.
  const charged = await prisma.otpCode.updateMany({
    where: { id: record.id, consumed: false, attempts: { lt: MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (charged.count === 0) {
    await prisma.otpCode.update({ where: { id: record.id }, data: { consumed: true } }).catch(() => undefined);
    return { ok: false };
  }

  const matches = await bcrypt.compare(opts.code, record.codeHash);
  if (!matches) return { ok: false };

  await prisma.otpCode.update({ where: { id: record.id }, data: { consumed: true } });
  return { ok: true, userId: record.userId };
}

// Deliver the code. When an email provider (Resend) is configured we send a real
// email; otherwise (dev) we log it. Codes are NEVER logged in production.
async function dispatch(destination: string, code: string): Promise<void> {
  if (config.email.enabled) {
    await sendOtpEmail(destination, code);
    return;
  }
  if (!config.isProd) {
    // eslint-disable-next-line no-console
    console.log(`[otp] code for ${destination}: ${code}`);
  }
  // No provider configured in production → the boot warning in config.ts fired.
  // (To add SMS instead, send via Twilio here when destination is a phone number.)
}

// Send the OTP via Resend's REST API (no SDK dependency — uses fetch). Swap for
// SendGrid/Postmark/Twilio by changing this one function.
async function sendOtpEmail(to: string, code: string): Promise<void> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.email.resendApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: config.email.from,
        to,
        subject: 'Your My Favor verification code',
        html: `<p>Your My Favor verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>It expires in ${config.otp.ttlMinutes} minutes. If you didn't request this, you can ignore this email.</p>`,
      }),
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error('OTP email failed:', res.status, await res.text().catch(() => ''));
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('OTP email error:', err);
  }
}
