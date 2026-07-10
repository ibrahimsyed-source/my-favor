import 'dotenv/config';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Environment validation. The server REFUSES TO BOOT with an invalid or
// insecure config — this is a security control, not a convenience. In
// particular, weak/placeholder JWT secrets are rejected in production.
// ---------------------------------------------------------------------------

const isProd = process.env.NODE_ENV === 'production';

const rawSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:8081'),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  OTP_DEV_RETURN: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  STRIPE_SECRET_KEY: z.string().optional().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(''),
  // Email delivery for OTP codes (Resend). Leave blank in dev (codes are logged).
  RESEND_API_KEY: z.string().optional().default(''),
  OTP_FROM_EMAIL: z.string().optional().default('My Favor <onboarding@resend.dev>'),
  // When true, a missing/sandbox email provider is a HARD boot failure in prod
  // (the safe default for a real launch). Left OFF for now so deploys aren't
  // blocked before Resend is configured — set REQUIRE_EMAIL_PROVIDER=true in the
  // Render dashboard once RESEND_API_KEY + a verified sender are in place, and
  // the strict check comes back with no code change.
  REQUIRE_EMAIL_PROVIDER: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // Operational gates surfaced to the app via GET /api/config (flip without a
  // code change on the next boot). MAINTENANCE_MODE takes the app to a
  // maintenance screen; MIN_APP_VERSION forces an update below that version.
  MAINTENANCE_MODE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  MIN_APP_VERSION: z.string().optional().default('0.0.0'),
});

const parsed = rawSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment configuration:\n', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

// Reject weak secrets. A short or obviously-placeholder secret defeats JWT
// security entirely, so we fail hard rather than start in an insecure state.
const WEAK = /replace|changeme|secret|password|example/i;
function assertStrongSecret(name: string, value: string) {
  const tooShort = value.length < 32;
  const placeholder = WEAK.test(value);
  if (isProd && (tooShort || placeholder)) {
    // eslint-disable-next-line no-console
    console.error(`❌ ${name} is too weak for production (needs a long, random value).`);
    process.exit(1);
  }
  if (tooShort || placeholder) {
    // eslint-disable-next-line no-console
    console.warn(`⚠️  ${name} looks weak — fine for local dev, NEVER use in production.`);
  }
}
assertStrongSecret('JWT_ACCESS_SECRET', env.JWT_ACCESS_SECRET);
assertStrongSecret('JWT_REFRESH_SECRET', env.JWT_REFRESH_SECRET);

if (isProd && env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
  // eslint-disable-next-line no-console
  console.error('❌ JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ.');
  process.exit(1);
}

if (isProd && env.OTP_DEV_RETURN) {
  // eslint-disable-next-line no-console
  console.error('❌ OTP_DEV_RETURN must be false in production (codes would be exposed).');
  process.exit(1);
}

export const config = {
  isProd,
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  corsOrigins: env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  databaseUrl: env.DATABASE_URL,
  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessTtl: env.ACCESS_TOKEN_TTL,
    refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
  },
  otp: {
    devReturn: env.OTP_DEV_RETURN,
    ttlMinutes: env.OTP_TTL_MINUTES,
  },
  stripe: {
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    enabled: env.STRIPE_SECRET_KEY.length > 0,
  },
  email: {
    resendApiKey: env.RESEND_API_KEY,
    from: env.OTP_FROM_EMAIL,
    enabled: env.RESEND_API_KEY.length > 0,
  },
  app: {
    maintenance: env.MAINTENANCE_MODE,
    minVersion: env.MIN_APP_VERSION,
  },
} as const;

// In production you need a real way to deliver OTP codes (dev-return is blocked
// above). With no email provider AND no dev-return, every signup/login/reset
// generates a code that can never reach the user — a silently broken auth path.
// This is HARD-FAILED only when REQUIRE_EMAIL_PROVIDER=true (the launch default);
// otherwise it warns loudly and boots, so deploys aren't blocked before Resend
// is wired up. Re-enable strictness with that one env flag once RESEND is set.
function emailMisconfig(msg: string) {
  if (env.REQUIRE_EMAIL_PROVIDER) {
    // eslint-disable-next-line no-console
    console.error('❌ ' + msg + ' (REQUIRE_EMAIL_PROVIDER=true) — refusing to boot.');
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.warn('⚠️  ' + msg + ' Booting anyway; set REQUIRE_EMAIL_PROVIDER=true to enforce.');
}
if (isProd && !env.RESEND_API_KEY) {
  emailMisconfig('No RESEND_API_KEY set in production — OTP codes cannot be delivered, so users cannot sign up, log in, or reset a password.');
}
// The Resend sandbox sender only delivers to the account owner, so a prod deploy
// still using it would silently fail for real users.
else if (isProd && /onboarding@resend\.dev/i.test(env.OTP_FROM_EMAIL)) {
  emailMisconfig('OTP_FROM_EMAIL is still the Resend sandbox sender (onboarding@resend.dev), which only delivers to the Resend account owner. Set a verified sending-domain address.');
}
