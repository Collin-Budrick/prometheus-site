# syntax=docker/dockerfile:1.5
FROM oven/bun:1.3.5 AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/site/package.json apps/site/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/platform/package.json packages/platform/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/features/auth/package.json packages/features/auth/package.json
COPY packages/features/lab/package.json packages/features/lab/package.json
COPY packages/features/messaging/package.json packages/features/messaging/package.json
COPY packages/features/store/package.json packages/features/store/package.json
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --ignore-scripts --frozen-lockfile --omit=optional --omit=dev --filter @prometheus/platform

FROM oven/bun:1.3.5 AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/apps/site/package.json ./apps/site/package.json
COPY --from=deps /app/packages/platform/package.json ./packages/platform/package.json

COPY tsconfig.base.json ./tsconfig.base.json
COPY apps/site ./apps/site
COPY packages ./packages
RUN --mount=type=cache,target=/root/.bun/install/cache \
    --mount=type=cache,target=/root/.cache \
    bun run --cwd packages/platform build

FROM oven/bun:1.3.5 AS runner
WORKDIR /app/packages/platform
ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=4000

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages/platform/dist ./dist
COPY --from=builder /app/packages/platform/drizzle ./drizzle
COPY --from=builder /app/packages/platform/package.json ./package.json

EXPOSE 4000
CMD ["bun", "run", "dist/index.js"]
