# My Favor — Deployment Checklist

Last updated: 2026-08-19 (store-submission pass)

Everything that can be done from code/config is DONE. What remains is listed
under **"Ibrahim must do manually"** — each item needs a human account action
(interactive login, bank info, store-portal uploads).

---

## ✅ Done (verified this pass)

### Builds (EAS)
- Logged in to EAS CLI as `ibrahimsyed@myfavrapp.com` (owner of
  `my-favor-app-1`). Project re-linked: slug `my-favor-1`, projectId
  `4953426c-879b-4b41-b32b-ae626a2a6a46`. (The slug is Expo-internal; the
  store-facing bundle id / package is `com.myfavrapp.app` on both platforms.)
- `eas.json` production profile: `autoIncrement`, EAS **production
  environment** (injects `EXPO_PUBLIC_GOOGLE_MAPS_KEY` from EAS env vars, kept
  out of git), `EXPO_PUBLIC_API_URL=https://my-favor-api.onrender.com`,
  Android **app-bundle** (AAB, what Play requires), iOS `m-medium`.
- **Android production build**: launched from this machine — v1.0.0,
  versionCode 2, AAB, `com.myfavrapp.app`. Check status / grab the artifact:
  `npx eas-cli build:list --limit 1` (or the EAS dashboard). The Android
  keystore lives on EAS servers (do NOT regenerate; back it up via
  `npx eas-cli credentials -p android` ▸ download).
- **iOS production build**: attempted `--non-interactive` → blocked exactly
  here: *"Distribution Certificate is not validated for non-interactive
  builds"*. One interactive run is required (see manual step 1). Everything
  else (bundle id, entitlements, profiles config) is ready.

### Store listing assets (paste-ready)
- `store-metadata/` — one file per App Store Connect / Play Console field:
  description, subtitle, keywords, promo text, short/full description, release
  notes, review notes, plus questionnaire answers (age rating, App Privacy
  labels, Play data safety, IARC content rating) and URL tables.
  All within store character limits — verify anytime:
  `node scripts/check-store-metadata.js`.
- Legal pages are served by the API itself (`/privacy`, `/terms`, `/support`
  in `server/src/routes/legal.routes.ts`) — live on the next Render deploy;
  these are the URLs referenced in the metadata.
- App Review demo account seeded by `server/prisma/seed.ts`:
  `reviewer@myfavor.app`, pre-verified (password = `REVIEWER_PASSWORD` env at
  seed time, else the demo default in seed.ts — set a strong one for prod).

### Push notifications
- Client + server fully wired (Expo push service — free, no API key):
  device registers `ExponentPushToken` → `PATCH /api/profile/push-token`;
  server pushes on accept/arrival/completion (`server/src/lib/push.ts`) and
  clears dead tokens (DeviceNotRegistered).
- `expo-notifications` plugin configured in app.json (iOS push entitlement is
  added by the plugin at prebuild).
- `app.config.js` auto-wires `android.googleServicesFile` from either the
  `GOOGLE_SERVICES_JSON` EAS *file* env var (recommended — the file itself is
  gitignored) or a local `./google-services.json`. No code change needed when
  the Firebase file arrives (manual step 4).

### Stripe (live-mode readiness — wiring verified)
- Server: `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` read from env
  (`server/src/config.ts` ▸ `config.stripe`), client built in
  `server/src/lib/stripe.ts`, gated by `stripeEnabled()` with a mock-ledger
  fallback. **Going live is a pure env swap** — no code change.
- App: uses Stripe-hosted Checkout (no native SDK);
  `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` is in the app env for parity.
- Test keys (`sk_test_…`/`pk_test_…`) deliberately left in place per plan.

### Verification (all green)
- App `npx tsc --noEmit` → clean.
- Server `npx tsc --noEmit` → clean.
- Server `npm test` → **31/31 pass** (includes a new test that the public
  `/privacy`, `/terms`, `/support` pages serve HTML). Test harness pins
  mock-Stripe + dev-OTP env in `tests/_setup.ts` so the suite is hermetic
  regardless of the real credentials in `server/.env`.

---

## ⚠️ Ibrahim must do manually

### 1. iOS build — one interactive EAS run (needs your Apple ID)
```bash
npx eas-cli build --platform ios --profile production
```
- Sign in with your Apple Developer Apple ID when prompted. Let EAS register
  the bundle id (`com.myfavrapp.app`), create the distribution certificate +
  provisioning profile, and **answer YES when it offers to set up a Push
  Notifications key (APNs)** — that's the entire iOS push-cert step.
- After this one run, future builds work non-interactively. (Optional, for
  CI: `npx eas-cli credentials` ▸ iOS ▸ App Store Connect API Key.)

### 2. App Store Connect — create the app + submit
- appstoreconnect.apple.com ▸ Apps ▸ New App → bundle id `com.myfavrapp.app`.
- Paste each file from `store-metadata/apple/` into its field; answer the
  age-rating + App Privacy questionnaires from `age_rating.md` /
  `app_privacy.md`; upload screenshots (6.7" + 6.5").
- Fill `eas.json ▸ submit.production.ios`: `appleId` (your Apple ID email),
  `ascAppId` (App Store Connect ▸ App Information ▸ Apple ID — numeric),
  `appleTeamId` (developer.apple.com ▸ Membership). Then:
  `npx eas-cli submit --platform ios --latest`.

### 3. Google Play Console — create the app + first upload
- play.google.com/console ($25 one-time) ▸ Create app → paste
  `store-metadata/google/` files; data-safety + content-rating answers are in
  `data_safety.md` / `content_rating.md`; upload the AAB from the finished
  Android build (**the very first AAB must be uploaded by hand** in the
  console; `eas submit` works from then on).
- For `eas submit -p android`: create a service-account JSON (Play Console ▸
  API access), save it OUTSIDE the repo (the `*-service-account*.json`
  pattern is gitignored regardless), and point
  `eas.json ▸ submit.production.android.serviceAccountKeyPath` at it.
- Play also needs: 512×512 icon, 1024×500 feature graphic, phone screenshots.

### 4. Android push (FCM) — Firebase project
- console.firebase.google.com ▸ create project ▸ add Android app
  `com.myfavrapp.app` ▸ download `google-services.json` to the repo root.
- Hand it to EAS builds (file is gitignored, so use the file env var):
  ```bash
  npx eas-cli env:create --scope project --name GOOGLE_SERVICES_JSON \
    --type file --value ./google-services.json --environment production
  ```
- Upload the FCM **V1 service-account key** so Expo's push service can send:
  Firebase console ▸ Project settings ▸ Service accounts ▸ generate key, then
  `npx eas-cli credentials -p android` ▸ Google Service Account ▸ FCM V1.
- Rebuild Android once after this so the AAB embeds the Firebase config.

### 5. Stripe — go live (needs your bank/business info)
- Dashboard: finish business/identity + bank info, enable **Connect
  (Express)**, activate live mode.
- Swap env on Render: `STRIPE_SECRET_KEY=sk_live_…`; create a live webhook →
  `https://my-favor-api.onrender.com/api/stripe/webhook`, set
  `STRIPE_WEBHOOK_SECRET=whsec_…` (currently blank — webhooks are rejected
  until set). App side: `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_…`.

### 6. Resend — verified sending domain
- Verify your domain in Resend; set
  `OTP_FROM_EMAIL="My Favor <noreply@yourdomain>"`, then
  `REQUIRE_EMAIL_PROVIDER=true` on Render. (Sandbox sender only delivers to
  you — real signups won't get codes until this is done.)

### 7. Legal entity placeholder (blocks review)
- The Terms/Privacy copy still contains the bracketed `LEGAL_ENTITY`
  placeholder. Replace it in **both** `src/screens/legal.tsx` (in-app) and
  `server/src/routes/legal.routes.ts` (hosted pages) with the registered
  company entity, address, and governing-law jurisdiction — counsel sign-off —
  then rebuild the app and redeploy the server.

### 8. Security hygiene before launch
- Rotate the secrets that passed through chat/git history (JWT secrets,
  Supabase password, Stripe, Resend, Maps) — set new values only in Render/EAS
  dashboards.
- Restrict the Google Maps key (API + app restrictions) in Google Cloud.
- Set a strong `REVIEWER_PASSWORD` and re-run the seed for the demo account.
- `support@myfavor.app` must become a real monitored inbox (or change it in
  `server/src/routes/legal.routes.ts` + both listings).

### 9. Screenshots & graphics
- iPhone 6.7"/6.5" screenshots (4–6), Android phone screenshots, 512×512
  icon, 1024×500 feature graphic. Shot list: bottom of `APP_STORE_LISTING.md`.

---

## Quick commands

```bash
npx eas-cli build:list --limit 3            # build status / artifact URLs
npx eas-cli build -p ios --profile production      # (interactive, step 1)
npx eas-cli build -p android --profile production  # rebuild Android
node scripts/check-store-metadata.js        # metadata length check
cd server && npm test && npx tsc --noEmit   # server suite (31 tests)
npx tsc --noEmit                            # app typecheck (repo root)
```
