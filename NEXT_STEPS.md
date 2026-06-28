# Next steps — credential / native-gated work

The recent feature pass (Browse board, realtime, earnings cash-out, re-request,
reviews, two-way ratings, scheduling, distance, in-app notifications) was built
to run **today** in the current setup (Expo web / Expo Go, no custom dev build,
no external accounts). A few pieces were deliberately stubbed at the JS layer
because finishing them requires a native module + a custom dev build, or an
external account/credentials. Those are listed here so nothing is hidden.

| Area | What ships now | What's gated, and on what |
| --- | --- | --- |
| **Distance / "Closest" sort** (#8) | Real haversine distance from a fixed pal origin (a city center). Sorting + "X mi" labels work. | **Live GPS** needs `expo-location` + a dev build. Swap `PAL_ORIGIN` in `src/screens/pal.tsx` for `getCurrentPositionAsync()`. |
| **Notifications** (#9) | Records created server-side on events; in-app list + bell poll every 20s; mark-all-read. | **Remote push** needs `expo-notifications` + APNs (iOS) / FCM (Android) creds, a server-side device-token store, and a send step. |
| **Maps** | Stylized placeholder backdrops. | Real tiles need `react-native-maps` + a Google Maps API key + a dev build. |
| **Payments** | Server-authoritative ledger; cash-out marks earnings paid out (stub). | Real money needs **Stripe** (`STRIPE_SECRET_KEY`): PaymentIntents for charges, **Connect** for pal payouts/cash-out, webhook reconciliation. |
| **OTP delivery** | 6-digit codes generated + verified; printed to console in dev. | Real SMS/email needs **Twilio** (or an email provider) wired in `server/src/lib/otp.ts` `dispatch()`. |
| **Saved addresses** (#5) | Member's home + recent favor addresses as one-tap chips (no backend change). | **Labeled saved places** (Home/Work, managed list) need a small `SavedAddress` model + CRUD endpoints. |

None of these block running or demoing the app. They're the same productionization
items from `BUILD_ROADMAP.md`, now with the JS-side UX already in place so each is
a focused swap rather than a from-scratch build.
