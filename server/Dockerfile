# Production image for the My Favor API. Multi-stage: build with dev deps, run
# lean. Works with any DATABASE_URL (point it at managed Postgres in prod).
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
# the image regenerates the Prisma client for Postgres and runs `prisma db push`
# on boot, which need the Prisma CLI (+ tsx for seeding) baked in — so restarts
# don't depend on fetching tools at runtime.
RUN npm ci --include=dev
COPY prisma ./prisma
# Production runs on Postgres. The committed schema uses SQLite for zero-setup
# local dev; flip the provider here so the image targets Postgres without
# changing local. (Schema uses only portable types, so this is safe.)
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
RUN npx prisma generate
COPY --from=build /app/dist ./dist
EXPOSE 4000
# Sync the schema to the Postgres DB, then start.
#
# TRADEOFF (deferred, intentional): This uses `prisma db push`, not the
# production-grade `prisma migrate deploy`. db push is a schema-diff tool with
# no migration history, no review/rollback, and it can drop/alter columns to
# match the schema (potential data loss on a live DB). We use it here because
# the committed migrations are SQLite-only (schema.prisma ships as SQLite for
# zero-setup local dev and is flipped to Postgres in this image above), so
# there are no Postgres-native migration files to deploy.
#
# PRODUCTION-GRADE PATH (do this before real user data lands): generate a
# Postgres migration set (`prisma migrate dev` against a Postgres URL, commit
# prisma/migrations), fix the provider to postgresql for prod instead of
# sed-rewriting at build time so local and prod share ONE migration history,
# then replace the command below with `npx prisma migrate deploy`.
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
