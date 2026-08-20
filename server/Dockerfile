# Production image for the My Favor API. Multi-stage: build with dev deps, run
# lean. DATABASE_URL must be a Postgres URL (on Render: the Supabase
# TRANSACTION pooler, port 6543 with ?pgbouncer=true) and DIRECT_URL the
# Supabase SESSION pooler (port 5432), used only by `prisma migrate deploy`.
FROM node:22-slim AS build
WORKDIR /app
# Prisma needs openssl present to generate/run its query engine.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
# Install incl. devDependencies (--include=dev overrides NODE_ENV=production):
# the image runs `prisma migrate deploy` on boot, which needs the Prisma CLI
# (+ tsx for seeding) baked in — so restarts don't depend on fetching tools at
# runtime.
RUN npm ci --include=dev
COPY prisma ./prisma
RUN npx prisma generate
COPY --from=build /app/dist ./dist
EXPOSE 4000
# Apply committed migrations (prisma/migrations, Postgres-native), then start.
# RESILIENT ON PURPOSE: if `migrate deploy` fails (e.g. DATABASE_URL/DIRECT_URL
# misconfigured or the DB briefly unreachable), we LOG the failure and still
# start the HTTP server — a hard exit here is what previously made Render
# auto-suspend the service after ~20 crash loops. The server binds 0.0.0.0 and
# reads process.env.PORT (Render sets PORT).
CMD ["sh", "-c", "npx prisma migrate deploy || echo '⚠️  prisma migrate deploy FAILED — starting the server anyway so the service stays up. Check DATABASE_URL / DIRECT_URL and redeploy.'; exec node dist/index.js"]
