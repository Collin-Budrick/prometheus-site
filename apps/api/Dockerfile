FROM oven/bun:1.3.4 AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY patches ./patches
RUN bun install --ignore-scripts

FROM oven/bun:1.3.4 AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/apps/api/package.json ./apps/api/package.json

COPY apps/api ./apps/api
RUN bun run --cwd apps/api build

FROM oven/bun:1.3.4 AS runner
WORKDIR /app/apps/api
ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=4000

COPY --from=builder /app/node_modules ../node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/drizzle ./drizzle
COPY --from=builder /app/apps/api/drizzle /app/apps/drizzle
COPY --from=builder /app/apps/api/package.json ./package.json

EXPOSE 4000
CMD ["bun", "run", "dist/index.js"]
