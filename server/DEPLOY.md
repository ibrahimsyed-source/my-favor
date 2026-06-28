# Deploying the My Favor API

The server runs locally on **SQLite** for zero-setup dev. Production needs
**Postgres** (SQLite isn't suitable for a hosted, multi-user, money-handling
app). This guide takes you from localhost to a deployed API.

---

## 1. Provision Postgres

Create a managed Postgres and copy its connection string. Easiest free options:
- **Neon** — <https://neon.tech> (serverless Postgres, generous free tier)
- **Supabase** — <https://supabase.com> (Postgres + extras)
- **Render Postgres** — if you host the API on Render too

You'll get a URL like `postgresql://user:pass@host/dbname?sslmode=require`.

## 2. Switch Prisma from SQLite to Postgres

In `prisma/schema.prisma`, change the datasource provider:
```prisma
datasource db {
  provider = "postgresql"   // was "sqlite"
  url      = env("DATABASE_URL")
}
```

The committed migrations are SQLite-flavored, so regenerate them for Postgres
**once** against your new database:
```bash
# point at your Postgres for this step
export DATABASE_URL="postgresql://...:sslmode=require"
rm -rf prisma/migrations          # drop the SQLite migrations
npx prisma migrate dev --name init   # creates Postgres-native migrations + applies them
npm run seed                          # optional: demo accounts + sample favors
```
Commit the new `prisma/migrations/`. From now on production uses
`prisma migrate deploy` (already the Docker `CMD`).

> Quick alternative for a first launch: skip migrations and run
> `npx prisma db push` to sync the schema directly. Adopt migrations later.

## 3. Environment variables (set these on the host)

| Var | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | your Postgres URL |
| `JWT_ACCESS_SECRET` | long random string (`openssl rand -hex 48`) |
| `JWT_REFRESH_SECRET` | a **different** long random string |
| `CORS_ORIGINS` | your app/web origins (never `*`) |
| `OTP_DEV_RETURN` | `false` (must be false in prod) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | when you wire Stripe |

The server validates these at boot and **refuses to start** with weak/placeholder
secrets or `OTP_DEV_RETURN=true` in production.

## 4. Deploy

**Render / Railway / Fly** — point them at `server/` and use the included
`Dockerfile` (or a Node service running `npm run build` then
`npm run migrate:deploy && npm start`). Set the env vars from step 3. The image
runs `prisma migrate deploy` on start, then boots the API. Health check: `GET /health`.

```bash
# local Docker smoke test (needs a reachable DATABASE_URL)
docker build -t my-favor-api ./server
docker run -p 4000:4000 --env-file ./server/.env my-favor-api
```

## 5. Point the app at the deployed API

Build the app with the public API URL:
```bash
EXPO_PUBLIC_API_URL=https://api.yourdomain.com npx expo start   # or eas build
```
Add `https://api.yourdomain.com` to `CORS_ORIGINS` on the server.

---

## Still to wire for a real launch (see ../NEXT_STEPS.md)
- **Stripe** (real charges + Connect payouts) — currently a ledger stub
- **Email/SMS OTP delivery** — `src/lib/otp.ts` `dispatch()` is a console stub in dev
- TLS is handled by the host's proxy; the app already sets `trust proxy` in prod.
