# Credentials checklist

Everything is wired and gated behind these credentials. Each integration runs in
mock/placeholder mode until its key is set, so the app works today; adding a key
turns the real thing on with no code change. Give me these (or set them yourself)
and we're live.

Legend: **[server]** = set in `server/.env` (or your host's env). **[app]** = set
when building the app (`EXPO_PUBLIC_...`, e.g. in EAS build env).

---

## 1. Backend hosting + database  **[server]**
- `DATABASE_URL` — managed Postgres (Neon / Supabase / Render). See `server/DEPLOY.md`.
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — two different long random strings
  (`openssl rand -hex 48`). Required; the server refuses weak secrets in prod.
- `NODE_ENV=production`, `CORS_ORIGINS=https://your-app-origin` (no `*`).

## 2. Stripe (payments + pal payouts)  **[server]**
- Create a Stripe account; **enable Connect** (Express) in the dashboard.
- `STRIPE_SECRET_KEY` — from the Stripe dashboard (test key to start, e.g. `sk_test_...`).
- `STRIPE_WEBHOOK_SECRET` — create a webhook endpoint pointing at
  `https://your-api/api/stripe/webhook`, copy its signing secret (`whsec_...`).
- Stripe needs your business + bank + tax info for payouts (their dashboard).
- ✅ Enables: saving cards (hosted Checkout), charging favors (destination charge),
  pal Connect onboarding, and cash-out payouts.

## 3. Email for sign-up codes (Resend)  **[server]**
- Create a Resend account (or SendGrid/Postmark — swap in `src/lib/otp.ts`).
- `RESEND_API_KEY` — your API key.
- `OTP_FROM_EMAIL` — a verified sender, e.g. `My Favor <noreply@yourdomain.com>`.
- ✅ Enables: real OTP delivery on signup. (Dev logs codes to the console.)

## 4. Google Maps  **[app]**
- Create a Google Cloud project; enable **Maps Static API** (and Geocoding if you
  add address lookup later). Create an API key.
- `EXPO_PUBLIC_GOOGLE_MAPS_KEY` — the key.
- ⚠️ This key ships in the app bundle (used in static-map image URLs), so
  **restrict it** in Google Cloud (API restriction = Static Maps; app/referrer
  restrictions) to prevent abuse.
- ✅ Enables: a real map of the favor location on the tracking screen.

## 5. Apple (submission)  **[server/eas.json]**
- Apple Developer Program ($99/yr). Then in `eas.json` ▸ `submit.production.ios`
  fill: `appleId`, `ascAppId` (App Store Connect app id), `appleTeamId`.

## 6. Point the app at your API  **[app]**
- `EXPO_PUBLIC_API_URL=https://your-api` when building (EAS) / running the app.

---

## Not wired yet (optional for v1, needs a native build)
- **Push notifications** — in-app notifications already work (polling). Real device
  push needs `expo-notifications` + APNs/FCM creds + a dev build; deferred since
  Apple doesn't require it for launch. See `NEXT_STEPS.md`.
- **Live Pal tracking** — **built** with `expo-location` (foreground-only); the
  member sees the Pal's real distance + position. Needs a **native dev build** to
  run (not Expo Go web). A pannable `react-native-maps` view is still optional.
