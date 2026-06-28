# My Favor — Backend API

A functioning, secure REST API for the My Favor marketplace, built with
**Node + TypeScript + Express + Prisma**. Runs locally with zero external
services (SQLite), and is structured to deploy to production (Postgres + Stripe)
by changing config, not code.

It implements the same domain model as the app (`src/types`) and is designed to
slot in behind the app's existing `useStore()` interface — the screens don't
change, only the store's implementation calls these endpoints.

---

## Quick start

```bash
cd server
npm install
cp .env.example .env          # then set JWT secrets (see below)
npm run prisma:generate
npm run migrate                # creates the SQLite dev.db + tables
npm run seed                   # demo accounts + sample data
npm run dev                    # http://localhost:4000
```

Generate strong dev secrets for `.env`:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Verify it's up:
```bash
curl http://localhost:4000/health           # {"ok":true,...}
```

**Demo accounts** (from the seed, password `Password123`):
- `alex@example.com` — member
- `jordan@example.com`, `sam@example.com` — pals

### Tests
```bash
npm test       # runs the end-to-end API suite (NODE_ENV=test)
```
The suite drives the full favor lifecycle and the security controls
(authorization, role gates, validation, anti-enumeration login, refresh-token
rotation, block enforcement, permanent account deletion).

---

## Security posture

| Control | Implementation |
| --- | --- |
| Password storage | bcrypt, cost 12; hashes never logged or serialized |
| Sessions | Short-lived JWT access tokens + opaque refresh tokens. Refresh tokens are stored only as SHA-256 hashes, are single-use (rotated), and revocable. |
| Authorization | Every resource route checks ownership/participation; role-gated routes via `requireRole`. No IDOR — you can only read/mutate your own data. |
| Input validation | Zod schema on body/params/query for every endpoint; unknown fields rejected (`.strict()` on profile update); strict size caps. |
| SQL injection | Prisma parameterizes all queries; no raw SQL. |
| Money integrity | Fees/payouts are **recomputed server-side** from the base price — a tampered client amount can't change what's charged or paid. |
| Race safety | Favor accept is an atomic conditional update, so two pals can't claim the same favor. |
| Rate limiting | Global + tighter auth + tightest OTP limiters (brute-force / SMS-bomb protection). |
| Headers / CORS | `helmet` secure headers; CORS locked to an explicit origin allowlist (never `*`). |
| Error handling | Centralized; 5xx never leak stack traces or internals to clients. |
| OTP | 6-digit crypto-random codes, bcrypt-hashed, short expiry, single-use, attempt-capped; codes never exposed in production. |
| Secrets | Validated at boot; server refuses to start in production with weak/placeholder/duplicate JWT secrets or with dev OTP exposure on. |
| Account deletion | Hard delete with cascading removal of all owned rows (App Store 5.1.1(v)). |
| Webhooks | Stripe webhook verifies the signature against the raw body; unverified payloads are rejected. |

---

## API surface

Base URL: `/api`. All routes except `auth/*`, `health`, and the Stripe webhook
require a `Bearer <accessToken>` header.

**Auth** — `POST /auth/signup`, `POST /auth/verify-otp`, `POST /auth/resend-otp`,
`POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`,
`POST /auth/change-password`, `DELETE /auth/account`

**Profile** — `GET /profile/me`, `PATCH /profile/me`, `POST /profile/role`,
`POST /profile/status`, `GET /profile/pals`, `GET /profile/pals/:id`

**Favors** — `POST /favors`, `GET /favors`, `GET /favors/active`,
`GET /favors/incoming` (pal), `GET /favors/:id`, `POST /favors/:id/accept` (pal),
`POST /favors/:id/decline` (pal), `POST /favors/:id/assign` (member),
`POST /favors/:id/advance` (pal), `POST /favors/:id/finish` (pal),
`POST /favors/:id/cancel` (member), `POST /favors/:id/rate` (member)

**Payments** — `GET /payments/cards`, `POST /payments/cards`,
`DELETE /payments/cards/:id`, `GET /payments/transactions`, `GET /payments/earnings`

**Messages** — `GET /messages/threads`, `POST /messages/threads`,
`GET /messages/threads/:id/messages`, `POST /messages/threads/:id/messages`

**Notifications** — `GET /notifications`, `POST /notifications/:id/read`,
`POST /notifications/read-all`

**Moderation** — `POST /moderation/report`, `POST /moderation/block`,
`DELETE /moderation/block/:userId`, `GET /moderation/blocked`

**Stripe** — `POST /stripe/webhook` (raw body, signature-verified)

---

## Connecting the app

The app's `src/store/index.tsx` currently fills the `StoreValue` interface with
mock data. To go live, replace the mock bodies with `fetch` calls to these
endpoints (store the access token in memory + refresh token in secure storage;
attach `Authorization: Bearer` on each call; refresh on 401). The interface and
every screen stay the same.

Point the app at the API with an env var, e.g. `EXPO_PUBLIC_API_URL=http://<lan-ip>:4000`.

---

## Going to production

1. **Database** — in `prisma/schema.prisma` set `provider = "postgresql"` and
   `DATABASE_URL` to your Postgres URL, then `npm run migrate:deploy`. No app
   code changes (the schema avoids SQLite-only features).
2. **Secrets** — set long random `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`
   (different values), `NODE_ENV=production`, `OTP_DEV_RETURN=false`. The server
   enforces these at boot.
3. **OTP / SMS** — wire Twilio (or email) in `src/lib/otp.ts` `dispatch()`.
4. **Payments** — set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`; implement
   PaymentIntents (charges), Connect (payouts), and webhook reconciliation.
5. **CORS** — set `CORS_ORIGINS` to your real app/web origins only.
6. **Build & run** — `npm run build && npm start` behind a TLS-terminating
   proxy; host on Render/Railway/Fly/your cloud of choice.

> Or: keep this schema/logic but run it on **Supabase** (the roadmap's
> recommendation) — Supabase is managed Postgres + Auth + Realtime + Storage, and
> these same tables/RLS rules apply. This Express service is a self-hostable
> equivalent you can run today without any external accounts.
