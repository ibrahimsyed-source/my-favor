# Next steps

The app + backend are built and wired end-to-end: a custom **Express + Prisma**
backend (`server/`) with JWT auth (email OTP), the full favor lifecycle, Stripe
charges + Connect payouts, real-time-ish messaging (polling), moderation
(report/block), a self-tracked ledger, **interactive maps** (`react-native-maps`
on native, Google Static Maps on web) with **live GPS tracking** + **address
geocoding**, and **push notifications** (`expo-notifications` + the Expo push
service, wired into the favor lifecycle). The remaining integrations are **wired
and gated behind credentials** — see `CREDENTIALS.md` for the exact keys and where
they go. Adding a key turns the real service on with no code change.

## Wired — just add credentials (CREDENTIALS.md)
| Integration | State | Turns on with |
| --- | --- | --- |
| **Stripe** (cards, favor charges, Connect payouts, cash-out) | Hosted-page flow, gated; mock ledger until keyed | `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` (Connect enabled) |
| **Email OTP** | Resend via fetch, gated; console in dev | `RESEND_API_KEY` + `OTP_FROM_EMAIL` |
| **Google Maps** | Static-map image on tracking, gated | `EXPO_PUBLIC_GOOGLE_MAPS_KEY` (restricted) |
| **Postgres** | One-line provider switch + migrations | `DATABASE_URL` (see `server/DEPLOY.md`) |
| **API URL** | Client reads it at build | `EXPO_PUBLIC_API_URL` |
| **Apple submit** | `eas.json` placeholders | Apple ID / ASC App ID / Team ID |

## Built — need a native dev build to exercise on device
These use native modules, so they run on a real **EAS dev build** (not Expo Go's
web preview). The web demo stays intact via graceful fallbacks.
- **Push notifications** — wired. The device registers an Expo push token on login
  (`registerForPushNotificationsAsync` → `PATCH /api/profile/push-token`), and the
  server pushes via the Expo push service (`server/src/lib/push.ts`) on favor
  accept / arrival / completion. In-app notifications still work via polling on
  web. Real device delivery needs APNs (iOS) / FCM (Android) credentials on the
  build.
- **Live Pal tracking + interactive maps** — wired (`expo-location`,
  foreground-only). The Pal's device streams GPS (`POST /favors/:id/location`), the
  member's active-favor poll receives it, and the tracking screen shows the real
  "how far away is my Pal" distance plus both pins on an **interactive
  `react-native-maps` map** (`src/components/LiveMap`), with a Google Static Maps
  image fallback on web. The Pal-side open-feed distance now uses the **browsing
  Pal's real GPS** (`usePalOrigin` in `src/screens/pal.tsx`, Miami fallback until a
  fix lands). Typed pickup addresses are geocoded via Google (`src/lib/geocode.ts`).

## Genuinely remaining
- **Postgres migration** — move off SQLite (one-line Prisma provider switch +
  `DATABASE_URL`; see `server/DEPLOY.md`).
- **Real pal vetting vendor** — swap the gated mock (auto-approve on a consented
  18+ submission) for Stripe Identity / Checkr.
- **Store submission** — accounts, hosted legal URLs, screenshots, demo account,
  privacy questionnaires, EAS build + submit (see `APP_STORE_COMPLIANCE.md`).

## The path to the App Store
1. You: create the accounts in `CREDENTIALS.md` (Apple has the longest lead time —
   start it first; D-U-N-S too if publishing as a company).
2. Deploy the backend + Postgres (`server/DEPLOY.md`), set the env vars.
3. Drop in the keys → everything goes live; smoke-test the real flows.
4. `eas build` (production) → TestFlight → App Store Connect (screenshots, privacy
   labels, age rating, demo account) → submit. (`APP_STORE_COMPLIANCE.md`.)
