# syntax=docker/dockerfile:1.5
FROM oven/bun:1.3.10-alpine AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/site/package.json apps/site/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/platform/package.json packages/platform/package.json
COPY packages/spacetimedb-client/package.json packages/spacetimedb-client/package.json
COPY packages/template-config/package.json packages/template-config/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/features/auth/package.json packages/features/auth/package.json
COPY packages/features/lab/package.json packages/features/lab/package.json
COPY packages/features/messaging/package.json packages/features/messaging/package.json
COPY packages/features/store/package.json packages/features/store/package.json
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --ignore-scripts --omit=optional --omit=dev

FROM oven/bun:1.3.10-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/apps ./apps
COPY --from=deps /app/packages ./packages

COPY tsconfig.base.json ./tsconfig.base.json
COPY apps/site ./apps/site
COPY packages ./packages
RUN --mount=type=cache,target=/root/.bun/install/cache \
    --mount=type=cache,target=/root/.cache \
    bun run --cwd packages/platform build

FROM oven/bun:1.3.10-alpine AS runner
WORKDIR /app/packages/platform
ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=4000

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages/platform/dist ./dist
COPY --from=builder /app/packages/platform/package.json ./package.json
COPY --from=builder /app/apps/site/src/lang /app/apps/site/src/lang

EXPOSE 4000
CMD ["bun", "run", "dist/index.js"]
