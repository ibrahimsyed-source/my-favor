// Imported first by the test suite, before any app/config module loads, so the
// integration tests run in test mode (rate limiters are skipped for the many
// accounts created from one IP). dotenv does not override an already-set var.
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
