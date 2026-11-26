# syntax=docker/dockerfile:1.7
# Multi-stage build. Targets: `web` (Next.js standalone) and `worker` (job queue + migrations).
ARG NODE_VERSION=24-alpine

FROM node:${NODE_VERSION} AS base
RUN corepack enable && apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build needs no secrets and no database (DB-backed routes render per request).
RUN pnpm build

FROM node:${NODE_VERSION} AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]

FROM deps AS worker
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --chown=app:app . .
USER app
# Runs pending migrations, then the worker loop (safe to run more than one replica).
CMD ["sh", "-c", "npx tsx scripts/migrate.ts && exec npx tsx --tsconfig tsconfig.worker.json workers/worker.ts"]
