import rateLimit from 'express-rate-limit';
import { config } from '../config';

// Rate limiting protects against brute-force and abuse. Auth endpoints get a
// much tighter budget than general API traffic. Limits are keyed by client IP.
// Skipped only under NODE_ENV=test so the integration suite (many accounts from
// one IP) isn't throttled — the limiters are always active in dev/production.
const skip = () => config.nodeEnv === 'test';

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: { code: 'too_many_requests', message: 'Too many requests, slow down.' } },
});

// Sensitive auth actions: login, signup, OTP verify, password reset.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: { code: 'too_many_requests', message: 'Too many attempts, try again later.' } },
});

// OTP issuance is even tighter to prevent SMS-bombing / enumeration.
export const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: { code: 'too_many_requests', message: 'Too many code requests, try again later.' } },
});
