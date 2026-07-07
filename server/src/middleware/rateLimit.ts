import rateLimit from 'express-rate-limit';
import { config } from '../config';

// Rate limiting protects against brute-force and abuse. Auth endpoints get a
// much tighter budget than general API traffic. Limits are keyed by client IP.
// Enforced in PRODUCTION only: local dev (a single trusted developer whose app
// polls notifications/active-favor on an interval) and the integration suite
// (many accounts from one IP) would otherwise exhaust the global budget and
// 429 the whole app. Brute-force protection is a production concern.
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
const skip = () => !config.isProd;

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

// Session/token endpoints (refresh, logout, change-password). Looser than the
// login/signup budget because a healthy client rotates its token roughly every
// access-token lifetime, but still bounded so a stolen/guessed refresh token
// can't be hammered. Refresh is the highest-frequency of these, so this caps
// the whole group generously rather than per-endpoint.
export const sessionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: { code: 'too_many_requests', message: 'Too many requests, try again later.' } },
});
