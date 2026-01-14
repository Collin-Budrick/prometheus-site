# syntax=docker/dockerfile:1.5
FROM oven/bun:1.3.6 AS deps
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
    bun install --ignore-scripts --frozen-lockfile --filter site

FROM oven/bun:1.3.6 AS runner
WORKDIR /app

ENV PORT=4444

COPY --from=deps /app/node_modules ./node_modules

EXPOSE 4444
CMD ["bun", "node_modules/y-webrtc/bin/server.js"]
