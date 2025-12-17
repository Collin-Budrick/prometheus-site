# Prometheus Site Monorepo

Performance-first monorepo running a Qwik City SSR web app and a Bun + Elysia API, wired together with Postgres and Valkey.

## Architecture

- **apps/web** - Qwik City SSR with UnoCSS + Lightning CSS, Speculation Rules, View Transitions, optional Partytown.
- **apps/api** - Bun + Elysia REST/WebSocket service using Drizzle ORM (Postgres) and Valkey for cache/pubsub.
- **infra/** - Nginx HTTP/3 reverse proxy, Postgres init scripts, Valkey config.
- **docker-compose** - Dev and prod profiles bundling web, api, db, valkey, and nginx.
- **scripts/perf-audit** - Lighthouse CI helper for bundle/perf verification.

### Ports

- Web: `4173`
- API: `4000`
- Postgres: `5433`
- Valkey: `6379`
- Nginx edge: `80/443` (HTTP/3 + Early Hints)

## Environment variables

See `.env.example` for defaults. Key values:

- `WEB_PORT`, `API_PORT`, `API_HOST`
- `DATABASE_URL` (preferred) or `POSTGRES_*` connection values and `POSTGRES_SSL`
- `VALKEY_HOST`, `VALKEY_PORT`
- `ENABLE_PARTYTOWN` to opt-in to Partytown for third-party scripts

## Scripts

- `bun run dev` - runs the web (Vite on `WEB_PORT`, default `4173`) and API dev servers together; the web dev server now fails fast if that port is taken, so free it or set `WEB_PORT` before starting.
- `bun run build` - builds the Qwik City web app (client + preview SSR server output) and the Bun/Elysia API.
- `bun run preview` - serves the built web app via Vite preview on `WEB_PORT` (`4173`); run `bun run build` first so `apps/web/server/entry.preview` exists, and keep the API running (`bun run --cwd apps/api dev` or `make prod`) for data.
- `bun run lint` - Oxlint across both apps; also used by `make test`.
- `bun run format` - oxfmt across both apps.
- `bun run test` - web tests via `bun test`; API currently returns a placeholder message.
- `VITE_DEV_AUDIT=1 bun run dev` - disables HMR/WebSocket and minifies optimized deps so Lighthouse/devtools audits avoid the Vite client payload and back/forward cache blockers.

## Local development

```bash
bun install --ignore-scripts
cp .env.example .env
make dev
```

This runs docker-compose in the **dev** profile with hot reload for both apps. Stop with `Ctrl+C`. View logs with `make logs`.

## Production-like

```bash
make prod
```

The **prod** profile adds Nginx (HTTP/3 + Early Hints) and expects TLS certs mounted at `infra/nginx/tls`. Use `make reset` to tear down containers and volumes.

## Database + cache workflows

- Generate SQL from Drizzle schema: `bun run --cwd apps/api db:generate`
- Migrate: `bun run --cwd apps/api db:migrate`
- Seed: `bun run --cwd apps/api db:seed`
- Studio: `bun run --cwd apps/api db:studio`
Caching for `/store/items` uses Valkey with cursor pagination keys; WebSocket chat fans out over Valkey pub/sub and persists to Postgres.

## Testing and quality

- `bun run lint` (Oxlint across web + api)
- `bun run test` placeholder (wire up framework tests as features grow)
- `scripts/perf-audit` (requires `@lhci/cli` globally) to run Lighthouse CI against the built web assets

## Performance guardrails

- Home route ships minimal HTML/CSS with cache headers; chat/WebSocket code only loads on the chat route.
- UnoCSS + Lightning CSS minimize CSS payloads; Vite 8 (Rolldown) powers builds.
- Speculation Rules pre-render/prefetch likely navigations; View Transitions provide smooth navigation without client runtime bloat.
- Partytown is optional for isolating third-party scripts off the main thread.

## TLS guidance

- Mount `fullchain.pem` and `privkey.pem` into `infra/nginx/tls/` for Nginx.
- HTTP/3 and Early Hints are enabled; an HTTP port 80 listener redirects to HTTPS.
