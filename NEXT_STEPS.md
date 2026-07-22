# Next steps

The app + backend are built and wired end-to-end. The remaining integrations are
**wired and gated behind credentials** — see `CREDENTIALS.md` for the exact keys
and where they go. Adding a key turns the real service on with no code change.

## Wired — just add credentials (CREDENTIALS.md)
| Integration | State | Turns on with |
| --- | --- | --- |
| **Stripe** (cards, favor charges, Connect payouts, cash-out) | Hosted-page flow, gated; mock ledger until keyed | `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` (Connect enabled) |
| **Email OTP** | Resend via fetch, gated; console in dev | `RESEND_API_KEY` + `OTP_FROM_EMAIL` |
| **Google Maps** | Static-map image on tracking, gated | `EXPO_PUBLIC_GOOGLE_MAPS_KEY` (restricted) |
| **Postgres** | One-line provider switch + migrations | `DATABASE_URL` (see `server/DEPLOY.md`) |
| **API URL** | Client reads it at build | `EXPO_PUBLIC_API_URL` |
| **Apple submit** | `eas.json` placeholders | Apple ID / ASC App ID / Team ID |

## Not wired — optional for v1 (need a native dev build)
These were intentionally left out because they require a native module + a custom
EAS build (and Apple doesn't require them for launch). The web/Expo-Go demo stays
intact without them.
- **Push notifications** — in-app notifications already work via polling. Real
  device push = `expo-notifications` + APNs (iOS) / FCM (Android) + token storage.
- **Live Pal tracking** — **built** (`expo-location`, foreground-only): the Pal's
  device streams GPS (`POST /favors/:id/location`), the member's active-favor poll
  receives it, and the tracking screen shows the real "how far away is my Pal"
  distance plus both pins on the (static) map. Needs a **native dev build** to run
  (no Expo Go web). Still open: a pannable `react-native-maps` view instead of the
  refreshing static image, and the Pal-side open-feed distance still uses a fixed
  origin (`PAL_ORIGIN` in `src/screens/pal.tsx`) rather than the browsing Pal's GPS.

## The path to the App Store
1. You: create the accounts in `CREDENTIALS.md` (Apple has the longest lead time —
   start it first; D-U-N-S too if publishing as a company).
2. Deploy the backend + Postgres (`server/DEPLOY.md`), set the env vars.
3. Drop in the keys → everything goes live; smoke-test the real flows.
4. `eas build` (production) → TestFlight → App Store Connect (screenshots, privacy
   labels, age rating, demo account) → submit. (`APP_STORE_COMPLIANCE.md`.)
