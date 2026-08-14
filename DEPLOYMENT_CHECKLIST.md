# My Favor — Deployment Checklist

Last updated: 2026-08-14

This file tracks what has been wired/verified vs. what **Ibrahim must still do
manually** (things that require a human, an account action, or a decision).

---

## ✅ Done (wired & verified in this pass)

### Credentials wired into env files (all gitignored)
- `server/.env` — dev-friendly local env with **all** real credentials
  (Supabase Postgres, Stripe test keys, Resend, Google Maps, JWT secrets).
- `server/.env.production` — production env (`NODE_ENV=production`,
  `OTP_DEV_RETURN=false`, real credentials). Copy these into your host
  (Render) dashboard for the live deploy.
- `.env` + `.env.local` (app root) — `EXPO_PUBLIC_GOOGLE_MAPS_KEY`,
  `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`, `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
  `EXPO_PUBLIC_API_URL`.
- `.gitignore` (root + server) hardened to exclude **all** `.env*` files
  (`.env`, `.env.*`), keeping `.env.example` tracked. Verified: no `.env`
  with secrets is tracked by git.

### Database migration to Supabase (Postgres)
- Prisma datasource switched from `sqlite` → `postgresql` (+ `directUrl`).
- `prisma migrate deploy` failed with **P3005** (the Supabase DB is **not
  empty** — it already hosts a *different* app in the `public` schema:
  `agent_status`, `conversations`, `memory`, `tasks`, `embeddings`, …).
- To avoid clobbering that other app, My Favor was migrated into a **dedicated
  `myfavor` Postgres schema** (`?schema=myfavor` on the connection URL) via
  `prisma db push`. **The other app's `public` data was never touched.**
- Verified: all **13** My Favor tables exist in the `myfavor` schema
  (`User`, `Favor`, `FavorEvent`, `Message`, `Notification`, `OtpCode`,
  `PaymentMethod`, `ProcessedWebhookEvent`, `RefreshToken`, `Report`,
  `Thread`, `Transaction`, `Block`).

### Integrations verified
- **Resend** — `server/src/lib/otp.ts` sends OTP via Resend REST using
  `RESEND_API_KEY` from env (`config.email.resendApiKey`). Enabled when the key
  is set. ✅
- **Stripe (server)** — `server/src/lib/stripe.ts` builds the client from
  `STRIPE_SECRET_KEY` (`config.stripe.secretKey`). Enabled = key present. ✅
- **Stripe (app)** — the app uses Stripe-**hosted Checkout** (no native Stripe
  SDK), so it does not currently consume a publishable key. The key is provided
  in the app env (`EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`) for parity/future use.
- **Google Maps** — app reads `EXPO_PUBLIC_GOOGLE_MAPS_KEY` (static maps +
  geocoding). Key set in app env; also added to `app.json` for native maps
  (`ios.config.googleMapsApiKey`, `android.config.googleMaps.apiKey`).

### app.json (App Store prep)
- `name: "My Favor"`, `slug: "my-favor"`, `version: "1.0.0"`.
- `ios.bundleIdentifier: "com.myfavrapp.app"`, `ios.supportsTablet: true`.
- `android.package: "com.myfavrapp.app"`.
- `description: "A peer-to-peer favor exchange app"`.
- Google Maps key added to `ios.config.googleMapsApiKey` and
  `android.config.googleMaps.apiKey`.

### Build / test verification
- `server` `npm test` → **30/30 pass** (full E2E lifecycle + security controls,
  run against the live Postgres `myfavor` schema). Test rows were **deleted**
  afterward — the schema is empty and launch-clean.
- `server` `npx tsc --noEmit` → **clean**.
- `app` `npx tsc --noEmit` → **clean**.
- Production config boot check (`NODE_ENV=production` + `.env.production`) →
  boots clean: Stripe enabled, Resend enabled, `OTP_DEV_RETURN=false`, DB
  reachable.

---

## ⚠️ Ibrahim must do manually (hard blockers / human-only actions)

### 1. Stripe — go live
- Current keys are **test mode** (`sk_test_…` / `pk_test_…`). No real money moves.
- In the Stripe dashboard: complete business/identity + **bank account** info,
  **enable Connect (Express)**, activate the account, then swap `STRIPE_SECRET_KEY`
  / `STRIPE_PUBLISHABLE_KEY` to the **live** `sk_live_…` / `pk_live_…` keys.
- Create a webhook endpoint → `https://<your-api>/api/stripe/webhook`, and set
  **`STRIPE_WEBHOOK_SECRET`** (`whsec_…`). It is currently **blank** — webhooks
  (payment/payout confirmations, disputes) will be rejected until it is set.

### 2. Resend — verified sending domain
- `OTP_FROM_EMAIL` is still the sandbox `onboarding@resend.dev`, which **only
  delivers to the Resend account owner**. Real users will NOT receive codes.
- Verify a domain in Resend, then set `OTP_FROM_EMAIL="My Favor <noreply@yourdomain>"`.
- After that, set **`REQUIRE_EMAIL_PROVIDER=true`** in production to hard-enforce
  deliverability.

### 3. Rotate the committed-in-history secrets
- These credentials were pasted into the task and now live in local `.env` files.
  Before/soon after launch, **rotate** the JWT secrets, Supabase DB password,
  Stripe keys, Resend key, and Google Maps key, and set the real values only in
  the host dashboard (never in the repo).

### 4. Google Maps — restrict the key
- The Maps key ships in the app bundle. **Restrict** it in Google Cloud (API
  restriction = Maps Static + Geocoding; iOS bundle id / Android SHA / HTTP
  referrer restrictions) to prevent abuse.

### 5. EAS / bundle identifier change (build impact)
- `slug` changed `my-favor-1` → `my-favor` and bundle id
  `com.myfavor.app` → `com.myfavrapp.app` (as requested).
- ⚠️ The existing EAS `projectId` (`4953426c-…`) and `owner` (`my-favor-app-1`)
  are tied to the old slug. On the next `eas build` you may need to **re-link or
  create the EAS project** for the new slug, and register the new bundle id /
  Android package. Verify `eas.json` and the EAS dashboard before building.

### 6. Apple / Google submission
- Apple Developer Program ($99/yr). Fill `eas.json ▸ submit.production.ios`
  (`appleId`, `ascAppId`, `appleTeamId`).
- Google Play Console account + service-account json for `eas submit` (Android).

### 7. Host env + CORS
- Set all `server/.env.production` values in the Render dashboard.
- `CORS_ORIGINS` is set to the API origin as a placeholder — set it to your real
  **web** origin(s) (native apps don't send Origin, so this only affects web).
- Consider using the Supabase **connection pooler** URL for `DATABASE_URL` (port
  6543, `?pgbouncer=true`) at runtime and keep the direct `:5432` URL as
  `DIRECT_URL` for migrations, if you expect high concurrency.

### 8. Note on the shared Supabase project
- This Supabase instance also hosts an unrelated app in the `public` schema.
  My Favor is isolated in the `myfavor` schema and does not touch it, but for a
  clean production posture consider a **dedicated Supabase project** for My Favor.

---

## Quick commands

```bash
# Re-run the production DB sync (from server/):
npx prisma db push               # syncs myfavor schema (uses server/.env)

# Verify server:
npm test                         # 30 E2E tests
npx tsc --noEmit                 # typecheck

# Verify app (from repo root):
npx tsc --noEmit
```
