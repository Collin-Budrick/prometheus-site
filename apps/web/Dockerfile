FROM oven/bun:1.3.5 AS deps
WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
RUN bun install --ignore-scripts --frozen-lockfile

FROM oven/bun:1.3.5 AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/apps/web/package.json ./apps/web/package.json
COPY --from=deps /app/apps/api/package.json ./apps/api/package.json

COPY apps/web ./apps/web
ARG VITE_API_BASE=/api
ARG VITE_ENABLE_PREFETCH
ARG VITE_ENABLE_WEBTRANSPORT_FRAGMENTS
ARG VITE_ENABLE_FRAGMENT_COMPRESSION
ARG VITE_ENABLE_ANALYTICS
ARG VITE_REPORT_CLIENT_ERRORS
ENV VITE_API_BASE=$VITE_API_BASE
ENV VITE_ENABLE_PREFETCH=$VITE_ENABLE_PREFETCH
ENV VITE_ENABLE_WEBTRANSPORT_FRAGMENTS=$VITE_ENABLE_WEBTRANSPORT_FRAGMENTS
ENV VITE_ENABLE_FRAGMENT_COMPRESSION=$VITE_ENABLE_FRAGMENT_COMPRESSION
ENV VITE_ENABLE_ANALYTICS=$VITE_ENABLE_ANALYTICS
ENV VITE_REPORT_CLIENT_ERRORS=$VITE_REPORT_CLIENT_ERRORS
RUN bun run --cwd apps/web build
RUN bun run --cwd apps/web build -- --ssr src/entry.preview.tsx

FROM oven/bun:1.3.5 AS runner
WORKDIR /app/apps/web

ENV API_BASE=http://api:4000

COPY --from=deps /app/node_modules /app/node_modules
COPY --from=builder /app/apps/web/package.json ./package.json
COPY --from=builder /app/apps/web/vite.config.ts ./vite.config.ts
COPY --from=builder /app/apps/web/dist ./dist
COPY --from=builder /app/apps/web/server ./server
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/apps/web/src ./src

EXPOSE 4173
CMD ["bun", "run", "preview", "--", "--host", "0.0.0.0", "--port", "4173"]
