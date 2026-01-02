# API (Bun + Elysia)

Bun-powered Elysia service with Postgres via Drizzle ORM and Valkey for cache/pubsub.

## Scripts

- `bun dev` – start the API with hot reload.
- `bun run src/db/migrate.ts` – apply pending migrations.
- `bun run src/db/seed.ts` – seed default data.
- `bun run src/db/migrate.ts && bun run src/db/seed.ts` – run before first start.
- `drizzle-kit generate` – generate SQL migrations from the schema.
- `drizzle-kit studio` – inspect schema interactively.

## Environment

Create a `.env` (or pass env vars at runtime) and set:

- **Core:** `API_PORT`, `API_HOST`, `API_URL`
- **Database:** `DATABASE_URL` (or `POSTGRES_*` + `POSTGRES_SSL`)
- **Cache:** `VALKEY_HOST`, `VALKEY_PORT`
- **Better Auth (required):** `BETTER_AUTH_COOKIE_SECRET`, `BETTER_AUTH_RP_ID`, `BETTER_AUTH_RP_ORIGIN`
- **Better Auth (multi-host):** `BETTER_AUTH_RP_IDS`, `BETTER_AUTH_RP_ORIGINS` (comma-separated, same order)
- **Better Auth OAuth (optional):** provider pairs such as `BETTER_AUTH_GOOGLE_CLIENT_ID` / `BETTER_AUTH_GOOGLE_CLIENT_SECRET`, plus GitHub/Apple/Discord/Microsoft variants

Passkeys require an RP ID + origin that match the host you serve over HTTPS. For local dev with Caddy + mkcert, set `BETTER_AUTH_RP_ID=localhost` and `BETTER_AUTH_RP_ORIGIN=https://localhost:4173` (or your forwarded dev host) so the WebAuthn challenge matches the browser origin.

## Docker

Build from the repo root so workspaces resolve correctly:

```
docker build -f apps/api/Dockerfile -t prometheus-api .
```

Run the container (map ports and provide env vars):

```
docker run --rm -p 4000:4000 --env-file .env prometheus-api
```

## Routes

- `GET /health` – readiness probe.
- `GET /store/items?cursor=0&limit=10` – cursor pagination with Valkey cache.
- `POST /ai/echo` – simple echo endpoint.
- `GET /chat/history` – fetch the latest chat messages.
- `WS /ws` – WebSocket chat backed by Valkey pub/sub.

The server runs migrations and seeds a baseline inventory on boot and keeps a shared Valkey connection for caching plus a duplicated subscriber for WebSocket fanout.
