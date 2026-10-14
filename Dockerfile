# syntax=docker/dockerfile:1
#
# Obligor runtime image. Multi-stage: full deps → production build → a slim,
# non-root runner serving Next.js' standalone output. node:24 provides the
# built-in node:sqlite the session/idempotency/registry stores rely on.

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build the self-contained server bundle (.next/standalone).
RUN npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data

RUN groupadd --gid 1001 nodejs \
 && useradd --uid 1001 --gid nodejs --shell /bin/false nextjs

# Static assets and the traced standalone server (includes node_modules it uses).
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Persistent volume root for the SQLite file (and JSON store fallback).
RUN mkdir -p /data && chown -R nextjs:nodejs /data
VOLUME ["/data"]

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# server.js is emitted by `output: "standalone"`.
CMD ["node", "server.js"]
