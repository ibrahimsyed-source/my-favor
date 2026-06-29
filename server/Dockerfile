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
# Full install (not --omit=dev): the image regenerates the Prisma client for
# Postgres and runs `prisma db push` on boot, which need the Prisma CLI + tsx
# (devDependencies). Pinned versions avoid the npx-fetches-latest mismatch.
RUN npm ci
COPY prisma ./prisma
# Production runs on Postgres. The committed schema uses SQLite for zero-setup
# local dev; flip the provider here so the image targets Postgres without
# changing local. (Schema uses only portable types, so this is safe.)
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
RUN npx prisma generate
COPY --from=build /app/dist ./dist
EXPOSE 4000
# Sync the schema to the Postgres DB, then start. db push (no migration files
# needed) keeps the SQLite-vs-Postgres migration histories from diverging; it
# applies non-destructive changes and refuses silent data loss.
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
