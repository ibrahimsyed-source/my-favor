// Imported first by the test suite, before any app/config module loads, so the
// integration tests run in test mode (rate limiters are skipped for the many
// accounts created from one IP). dotenv does not override an already-set var.
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';

// Hermetic external services: the suite exercises the MOCK payment ledger (real
// Stripe Connect onboarding is impossible in a test — cashout would 400 with
// "Set up payouts first") and reads OTP codes from the dev-return response
// (never real email). Clear/pin these BEFORE src/config loads, overriding
// whatever real credentials live in server/.env.
process.env.STRIPE_SECRET_KEY = '';
process.env.STRIPE_WEBHOOK_SECRET = '';
process.env.RESEND_API_KEY = '';
process.env.OTP_DEV_RETURN = 'true';
