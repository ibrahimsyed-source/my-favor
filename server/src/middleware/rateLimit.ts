import rateLimit from 'express-rate-limit';
import { config } from '../config';

// Rate limiting protects against brute-force and abuse. Auth endpoints get a
// much tighter budget than general API traffic. Limits are keyed by client IP.
// Skipped only under NODE_ENV=test so the integration suite (many accounts from
// one IP) isn't throttled — the limiters are always active in dev/production.
//
// SCALING LIMITATION: these limiters use express-rate-limit's default per-process
// MemoryStore. Counters are local to a single Node process and are wiped on every
// restart/redeploy. This is safe and effective ONLY while the API runs as a single
// instance — the current Render deploy MUST stay pinned to 1 instance. If the API is
// ever scaled horizontally, each instance keeps its own counters and the effective
// auth/OTP brute-force budget multiplies by the instance count, weakening exactly the
// tight authLimiter/otpLimiter caps that matter most. To scale beyond one instance,
// back these limiters with a shared store (e.g. rate-limit-redis) so counts are
// global. That requires adding Redis + a dependency and is intentionally deferred /
// out of scope here.
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
