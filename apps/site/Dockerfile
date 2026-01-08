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
    bun install --ignore-scripts --frozen-lockfile --filter site

FROM oven/bun:1.3.5 AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/apps/site/package.json ./apps/site/package.json

COPY tsconfig.base.json ./tsconfig.base.json
COPY apps/site ./apps/site
COPY packages ./packages
ARG VITE_API_BASE=/api
ARG VITE_ENABLE_PREFETCH
ARG VITE_ENABLE_WEBTRANSPORT_FRAGMENTS
ARG VITE_ENABLE_WEBTRANSPORT_DATAGRAMS
ARG VITE_ENABLE_FRAGMENT_COMPRESSION
ARG VITE_ENABLE_ANALYTICS
ARG VITE_ENABLE_HIGHLIGHT
ARG VITE_HIGHLIGHT_PROJECT_ID
ARG VITE_HIGHLIGHT_PRIVACY
ARG VITE_HIGHLIGHT_SESSION_RECORDING
ARG VITE_HIGHLIGHT_CANVAS_SAMPLING
ARG VITE_WEBTRANSPORT_BASE
ARG VITE_DISABLE_SW
ENV VITE_API_BASE=$VITE_API_BASE
ENV VITE_ENABLE_PREFETCH=$VITE_ENABLE_PREFETCH
ENV VITE_ENABLE_WEBTRANSPORT_FRAGMENTS=$VITE_ENABLE_WEBTRANSPORT_FRAGMENTS
ENV VITE_ENABLE_WEBTRANSPORT_DATAGRAMS=$VITE_ENABLE_WEBTRANSPORT_DATAGRAMS
ENV VITE_ENABLE_FRAGMENT_COMPRESSION=$VITE_ENABLE_FRAGMENT_COMPRESSION
ENV VITE_ENABLE_ANALYTICS=$VITE_ENABLE_ANALYTICS
ENV VITE_ENABLE_HIGHLIGHT=$VITE_ENABLE_HIGHLIGHT
ENV VITE_HIGHLIGHT_PROJECT_ID=$VITE_HIGHLIGHT_PROJECT_ID
ENV VITE_HIGHLIGHT_PRIVACY=$VITE_HIGHLIGHT_PRIVACY
ENV VITE_HIGHLIGHT_SESSION_RECORDING=$VITE_HIGHLIGHT_SESSION_RECORDING
ENV VITE_HIGHLIGHT_CANVAS_SAMPLING=$VITE_HIGHLIGHT_CANVAS_SAMPLING
ENV VITE_WEBTRANSPORT_BASE=$VITE_WEBTRANSPORT_BASE
ENV VITE_DISABLE_SW=$VITE_DISABLE_SW
RUN --mount=type=cache,target=/root/.bun/install/cache \
    --mount=type=cache,target=/root/.cache \
    bun run --cwd apps/site build
RUN --mount=type=cache,target=/root/.bun/install/cache \
    --mount=type=cache,target=/root/.cache \
    bun run --cwd apps/site build -- --ssr src/entry.preview.tsx

FROM oven/bun:1.3.5 AS runner
WORKDIR /app/apps/site

ENV API_BASE=http://api:4000

COPY --from=deps /app/node_modules /app/node_modules
COPY --from=builder /app/apps/site/package.json ./package.json
COPY --from=builder /app/apps/site/vite.config.ts ./vite.config.ts
COPY --from=builder /app/apps/site/dist ./dist
COPY --from=builder /app/apps/site/server ./server
COPY --from=builder /app/apps/site/public ./public
COPY --from=builder /app/apps/site/src ./src

EXPOSE 4173
CMD ["bun", "run", "preview", "--", "--host", "0.0.0.0", "--port", "4173"]
