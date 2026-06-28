# My Favor — Full Build Roadmap

From high-fidelity prototype → shippable, App-Store-accepted product.

Last updated: June 2026 · Expo SDK 56 · solo-dev pragmatic stack.

---

## The core insight: this is a swap, not a rewrite

Every screen already works and talks to data through **one interface** —
`useStore()` in `src/store/index.tsx` — over a clean, typed domain model in
`src/types`. The mock store's own header says it:

> *"Every async call below stands in for a real API. Replace the bodies with
> fetch()/Stripe/Twilio calls when wiring real services — the signatures stay."*

So the migration strategy for the entire build is:

**Keep the UI and the `StoreValue` interface. Replace the mock bodies, one
domain at a time, with real backend/Stripe/maps calls.** The app keeps running
the whole way — you swap `signup()` to real auth, then `requestFavor()` to a
real insert, etc. Nothing in `src/screens` should need structural change.

This de-risks everything below. The hard parts are the integrations themselves,
not re-plumbing the app.

---

## Recommended stack (fastest solid path for a solo dev)

| Need | Choice | Why |
| --- | --- | --- |
| Backend + DB | **Supabase** (Postgres) | Auth + DB + Realtime + Storage + Edge Functions in one. Relational fits a marketplace better than Firebase's document model. |
| Auth + phone OTP | **Supabase Auth** (phone provider, Twilio-backed) | Replaces mock `verifyOtp` without hand-rolling SMS. |
| Payments | **Stripe** + **Stripe Connect (Express)** | Member charges (PaymentIntents) + pal payouts. Industry standard; Apple-compliant for real-world services. |
| Maps + location | **react-native-maps** (Google) + **expo-location** | Real map, geocoding, live tracking. |
| Realtime (messages, tracking) | **Supabase Realtime** | Postgres change streams → no separate socket server. |
| Push | **expo-notifications** + Expo Push | Managed-workflow friendly. |
| Pal vetting | **Stripe Identity** (start) → **Checkr** (full background check) | Trust & safety; Apple cares for in-person apps. |
| Crash/error monitoring | **Sentry** (`sentry-expo`) | Needed before public launch. |
| Legal page hosting | **Vercel/Netlify** static | For the public Privacy/Terms URLs the stores require. |
| Secrets/config | Expo env vars + EAS secrets | Keep keys out of the bundle. |

> Alternative if you prefer it: **Firebase** (Auth + Firestore + Functions +
> FCM). Viable, but you'd model the relational data yourself and Stripe Connect
> wiring is similar effort. The phase plan below is stack-agnostic.

---

## Data model (derived from `src/types`)

Postgres tables, each mapping to an existing type. Enable Row-Level Security on all.

| Table | Source type | Key columns |
| --- | --- | --- |
| `profiles` | `User` | id (= auth uid), first/last name, email, phone, avatar, bio, city/state/zip, home_address, role, status, rating, total_favors, years_active, reliability, positive_reviews |
| `favors` | `Favor` | id, member_id, pal_id, tier, price, description, images[], location (lat/lng/address), status, created_at, scheduled_for, hours, service_fee, transaction_fee, total, tip, rating, feedback, eta_window |
| `favor_events` | status timeline | favor_id, status, actor_id, at — drives the tracking timeline + audit |
| `payment_methods` | `PaymentCard` | id, user_id, stripe_pm_id, brand, last4, exp_month, exp_year, is_default |
| `transactions` | `Transaction` | id, user_id, favor_id, kind (charge/payout/refund/fee), amount, status, stripe_ref, created_at |
| `threads` / `messages` | `Thread`/`Message` | thread(participants, favor_id); message(thread_id, sender_id, text, read, created_at) |
| `notifications` | `AppNotification` | id, user_id, type, body, read, created_at |
| `reports` | moderation | reporter_id, reported_user_id, favor_id, reason, status, created_at |
| `blocks` | moderation | blocker_id, blocked_id |

RLS posture: a user reads/writes only their own `profiles` row; a favor is
visible to its member and its (assigned or candidate) pal; messages only to
thread participants; transactions only to their owner.

---

## Phases

Effort is **focused solo-dev days** for someone comfortable in React Native.
Calendar time runs longer. Critical path is **0 → 1 → 2 → 3 → 4**; maps,
messaging, and safety can partly parallelize after the data layer exists.

### Phase 0 — Foundations & decisions · ~3–5 days
- Lock the stack; create Supabase project + Stripe (test mode) + start Apple
  ($99/yr) & Google ($25) enrollment (they take days to approve).
- Write the schema + migrations; enable RLS; seed a couple of test accounts.
- Set up env/secrets (`app.config.ts` for dynamic config, EAS secrets), a
  `src/lib/supabase.ts` client, and a `services/` layer the store will call.
- **Done when:** the app boots against a real (empty) backend with env wired.

### Phase 1 — Real auth & accounts · ~4–6 days
- Supabase phone-OTP → replace mock `signup` / `verifyOtp` / `login` / `logout`.
- Persist profile create/edit (`updateProfile`), avatar upload to Storage, role
  selection, `setStatus`, `changePassword`.
- **Server-side account deletion**: Edge Function (or RLS cascade) that deletes
  the auth user + all owned rows, called from the existing `deleteAccount()` UI.
- Session persistence + protected navigation (already keyed off `isAuthenticated`).
- **Done when:** you can sign up with a real code, edit your profile, and delete
  the account for real — all through the existing screens.

### Phase 2 — Core data layer · ~4–6 days
- Swap the in-memory collections for Supabase queries behind the **same store
  methods**: favors history, cards list, transactions, threads, notifications.
- Add loading/error states the mock never needed (the store currently resolves
  instantly; real network needs spinners + retry — the UI mostly has the slots).
- **Done when:** app state survives a reload because it's read from the DB.

### Phase 3 — The favor lifecycle (two-sided, realtime) · ~6–9 days
- Member: `requestFavor` inserts a real favor; matching surfaces it to pals.
- Pal: `acceptFavor` / `declineFavor` / `assignPal` / `finishFavorAsPal` mutate
  real rows; `advanceFavor` writes `favor_events`.
- **Supabase Realtime** so both sides see status changes live (the status
  timeline UI already exists — feed it real events).
- **Done when:** one device requests, another accepts and completes, both watch
  the status update live.

### Phase 4 — Payments (Stripe) · ~8–12 days · highest risk
- Member: SetupIntent to save cards (`addCard`), PaymentIntent on confirm using
  the existing `computeFees`; cancellation fees via `computeCancellation`.
- Pal: **Stripe Connect Express** onboarding — replaces the mock
  `StripeOnboarding` / `BankInfo` screens; payouts via `computePayout` (20%
  commission already modeled).
- Webhooks (Edge Function) → write `transactions` / earnings, handle refunds.
- **Never** collect raw card numbers — use Stripe's SDK/Payment Sheet (PCI +
  Apple 3.1 requirement).
- **Done when:** a member is really charged in test mode and a pal's payout
  shows in their Stripe Express dashboard.

### Phase 5 — Maps & live tracking · ~4–6 days
- react-native-maps + expo-location (add `NSLocationWhenInUseUsageDescription`
  and the location config **only now**, when you actually request it).
- Geocode addresses, show pal position, stream live location over Realtime into
  the existing `FavorTracking` screen (replaces `MapPlaceholder`).
- **Done when:** the member sees the pal move on a real map.

### Phase 6 — Messaging & notifications · ~3–5 days
- Realtime-backed `sendMessage` / `messagesFor`; unread counts.
- expo-notifications + Expo Push for new favors (pals), status changes &
  messages (members), payout events. Register tokens per device.
- **Done when:** a message and a status change both deliver a push.

### Phase 7 — Trust & safety · ~3–5 days
- Pal vetting: Stripe Identity (ID check) wired into the `Vetting` screen; plan
  Checkr for full background checks before scaling.
- `reportUser` writes to `reports` (a queue you can review); `blockUser` enforced
  at the data layer so blocked users disappear from matching/messaging.
- **Done when:** reports land somewhere actionable and blocks actually hide users.

### Phase 8 — Hardening & QA · ~5–8 days
- Real-network edge cases: offline, timeouts, retries, optimistic-UI rollback.
- Sentry for crashes; basic analytics on the key funnel.
- Device testing on real iOS + Android; accessibility pass on device;
  performance check (lists, images).
- **Done when:** the core flows survive flaky networks and a TestFlight tester
  can't break them.

### Phase 9 — Store submission · ~3–5 days + review wait
- Host reviewed Privacy/Terms; finalize `APP_STORE_COMPLIANCE.md` action items.
- Assets (icon 1024², screenshots per device), listing copy, privacy nutrition
  labels / Data Safety, age rating, **reviewer demo account** with OTP + test-card
  notes.
- Fill `eas.json` credential placeholders → `eas build` → TestFlight / Play
  internal testing → `eas submit` → iterate on review feedback.
- **Done when:** it's live.

---

## Rough totals

- **Engineering:** ~45–65 focused solo-dev days (~9–13 weeks calendar at a
  steady pace; faster with help or if you cut scope).
- **Critical path / long poles:** Payments (Phase 4) and the realtime favor
  lifecycle (Phase 3). Everything else is more predictable.
- **Start-early, runs-in-background items:** Apple/Google enrollment, legal
  review, and a background-check vendor account — kick these off in Phase 0 so
  they're not blockers at the end.

## Biggest risks to plan around
1. **Stripe Connect payouts** — onboarding, tax forms (1099-K thresholds),
   negative balances, and refund/dispute handling are fiddly. Budget extra here.
2. **Trust & safety for in-person meetups** — Apple scrutinizes this; have a real
   reporting/vetting story, not just UI.
3. **Two-sided realtime correctness** — race conditions in matching/accept (two
   pals accept the same favor). Make accept atomic at the DB level.
4. **Scope creep** — the prototype has many screens. Ship the core loop
   (request → match → do → pay → rate) solid before polishing the edges.

## Suggested MVP cut (if you want to launch sooner)
Phases 0–4 + 9, single city, **NOW**-only favors (defer scheduling), Stripe
Identity instead of full Checkr, push for the essentials only. That's a real,
chargeable, two-sided app you can submit — then layer maps polish, scheduling,
and full background checks post-launch.
