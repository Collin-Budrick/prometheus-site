# API (Bun + Elysia)

Bun-powered Elysia service with Postgres via Drizzle ORM and Valkey for cache/pubsub.

## Scripts

- `bun dev` – start the API with hot reload.
- `bun run src/db/migrate.ts` – apply pending migrations.
- `bun run src/db/seed.ts` – seed default data.
- `bun run src/db/migrate.ts && bun run src/db/seed.ts` – run before first start.
- `drizzle-kit generate` – generate SQL migrations from the schema.
- `drizzle-kit studio` – inspect schema interactively.

## Routes

- `GET /health` – readiness probe.
- `GET /store/items?cursor=0&limit=10` – cursor pagination with Valkey cache.
- `POST /ai/echo` – simple echo endpoint.
- `GET /chat/history` – fetch the latest chat messages.
- `WS /ws` – WebSocket chat backed by Valkey pub/sub.

The server runs migrations and seeds a baseline inventory on boot and keeps a shared Valkey connection for caching plus a duplicated subscriber for WebSocket fanout.
