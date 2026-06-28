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
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate
COPY --from=build /app/dist ./dist
EXPOSE 4000
# Apply pending migrations, then start. (For the very first Postgres deploy you
# can swap `migrate deploy` for `db push` — see DEPLOY.md.)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
