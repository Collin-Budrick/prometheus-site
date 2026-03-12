# API (Bun + Elysia)

Bun-powered Elysia service with SpaceTimeDB 2.0 for app state and Valkey for cache/supporting delivery state.

## Scripts

- `bun run dev` - start the API with hot reload.
- `bun run build` - build the production Bun entrypoint.

## Environment

Create a `.env` (or pass env vars at runtime) and set:

- **Core:** `API_PORT`, `API_HOST`
- **SpaceTimeDB:** `SPACETIMEDB_URI`, `SPACETIMEDB_MODULE`
- **Cache:** `VALKEY_HOST`, `VALKEY_PORT`
- **Rate limiting (Unkey):** `UNKEY_ROOT_KEY`, `UNKEY_RATELIMIT_NAMESPACE` (defaults to `prometheus-api`), `UNKEY_RATELIMIT_BASE_URL` (defaults to `https://api.unkey.com`)
- **SpacetimeAuth:** `SPACETIMEAUTH_AUTHORITY`, `SPACETIMEAUTH_CLIENT_ID`, `SPACETIMEAUTH_JWKS_URI`, `SPACETIMEAUTH_POST_LOGOUT_REDIRECT_URI`
- **Session bridge:** `BETTER_AUTH_COOKIE_SECRET`

If `UNKEY_ROOT_KEY` is unset (typical for local dev), the API falls back to in-memory rate limiting per instance. In edge/serverless runtimes, set the Unkey credentials so limits remain globally consistent without relying on Valkey.

## Docker

Build from the repo root so workspaces resolve correctly:

```sh
docker build -f packages/platform/Dockerfile -t prometheus-api .
```

Run the container (map ports and provide env vars):

```sh
docker run --rm -p 4000:4000 --env-file .env prometheus-api
```

## Routes

- `GET /health` - readiness probe.
- `GET /auth/session` - SSR/session compatibility payload backed by SpacetimeAuth claims.
- `POST /auth/session/sync` - mirrors the browser OIDC session into the signed site cookie.
- `POST /auth/logout` - clears the mirrored site session.
- `POST /ai/echo` - simple echo endpoint.

The app-state hot path is expected to run directly against SpaceTimeDB from the browser; this service remains responsible for fragment delivery, session compatibility, and secret-bearing integrations.
