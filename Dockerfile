# Dependencies and build run natively on the build machine ($BUILDPLATFORM), also for the arm64 image: the
# result is plain JavaScript once sharp is removed (see next.config.ts). Only the small runner stage runs per
# target platform, so arm64 no longer builds under emulation.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build-base
FROM node:24-alpine AS base

# ── Dependencies ──────────────────────────────────────────────────────────────
FROM build-base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# ── Builder ───────────────────────────────────────────────────────────────────
FROM build-base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env vars (replaced at runtime via NEXTAUTH_URL etc.)
ENV NEXT_TELEMETRY_DISABLED=1
# Shown next to the version in the app: empty for a release, e.g. "edge 2981c05" in between (set by the CI)
ARG APP_BUILD=dev
ENV APP_BUILD=$APP_BUILD

# sharp (image optimizer, native code for the build machine) is not used: no next/image, images unoptimized
RUN npm run build && rm -rf .next/standalone/node_modules/sharp .next/standalone/node_modules/@img

# ── Runner ────────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# The base image's user node (UID 1000): usually the same as the first user on the host,
# so a folder created there for /data needs no chown
RUN mkdir /data && chown node:node /data

# Songs the hosts' games played, so later games bring new ones first (mount a volume to keep them across updates)
ENV DATA_DIR=/data

COPY --from=builder /app/public ./public

# Standalone output (next.config.ts: output: "standalone")
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static   ./.next/static

USER node

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# busybox wget is part of the Alpine base image
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" > /dev/null || exit 1

CMD ["node", "server.js"]
