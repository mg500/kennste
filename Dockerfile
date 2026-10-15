# Dependencies and build run natively on the build machine ($BUILDPLATFORM), also for the arm64 image: the
# result is plain JavaScript once sharp is removed (see next.config.ts). Only the small runner stage runs per
# target platform, so arm64 no longer builds under emulation.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build-base
FROM node:22-alpine AS base

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

# sharp (image optimizer, native code for the build machine) is not used: no next/image, images unoptimized
RUN npm run build && rm -rf .next/standalone/node_modules/sharp .next/standalone/node_modules/@img

# ── Runner ────────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Standalone output (next.config.ts: output: "standalone")
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static   ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
