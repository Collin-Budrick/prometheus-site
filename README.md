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
- Operational toggles: `RUN_MIGRATIONS` (auto-run DB migrations on API start) and `VITE_PREVIEW` (serve built web via Vite preview)

## Scripts

- `bun run dev` - runs the web (Vite on `WEB_PORT`, default `4173`) and API dev servers together; the web dev server now fails fast if that port is taken, so free it or set `WEB_PORT` before starting.
- `bun run build` - builds the Qwik City web app (client + preview SSR server output) and the Bun/Elysia API.
- `bun run preview` - serves the built web app via Vite preview on `WEB_PORT` (`4173`); run `bun run build` first so `apps/web/server/entry.preview` exists, and keep the API running (`bun run --cwd apps/api dev` or `make prod`) for data.
- `bun run lint` - Oxlint across both apps; also used by `make test`.
- `bun run format` - oxfmt across both apps.
- `bun run test` - web tests via `bun test`; API currently returns a placeholder message.
- `VITE_DEV_AUDIT=1 bun run dev` - disables HMR/WebSocket and minifies optimized deps so Lighthouse/devtools audits avoid the Vite client payload and back/forward cache blockers. Leave this unset in normal dev shells; audit mode forces full reloads because HMR is off.

## Local development

```bash
bun install --ignore-scripts
cp .env.example .env
make dev
```

This runs docker-compose in the **dev** profile with hot reload for both apps. Stop with `Ctrl+C`. View logs with `make logs`.

### Docker/WSL HMR tips

The Vite dev server defaults to WebSocket HMR (`apps/web/src/config/env.ts`) and wires those settings through the `server.hmr` block in `apps/web/vite.config.ts`. When running inside Docker or WSL, set `HMR_HOST` to an address reachable by the browser (e.g., your host IP or `localhost` when port-forwarded) and `HMR_CLIENT_PORT` to the forwarded dev port so the Vite client can open the WebSocket. Avoid `VITE_HMR_POLLING=1` unless necessary; it forces polling and disables the faster WebSocket path.

## Production-like

```bash
make prod
```

The **prod** profile adds Nginx (HTTP/3 + Early Hints) and expects TLS certs mounted at `infra/nginx/tls`. Use `make reset` to tear down containers and volumes.

### Edge deployment + Early Hints

- HTTP/3 terminates at Nginx with `Alt-Svc` advertising `h3=":443"`; the reverse proxy fans back to the web container on `4173`.
- Early Hints (103) are emitted only for the document and the built critical CSS asset to avoid racing HMR bundles in dev. Route-specific mappings live in `infra/nginx/nginx.conf` under the `$early_hint_links` map.
- To validate in staging, hit the edge directly with HTTP/3 and inspect the 103 and `Link` headers:

```bash
curl -k -I --http3 https://staging.example.com/
curl -k -I --http3 https://staging.example.com/store
```

You should see a `103 Early Hints` status followed by `Link` headers for the document and CSS before the final 200/304.

## Database + cache workflows

- Generate SQL from Drizzle schema: `bun run --cwd apps/api db:generate`
- Migrate: `bun run --cwd apps/api db:migrate`
- Seed: `bun run --cwd apps/api db:seed`
- Studio: `bun run --cwd apps/api db:studio`
Caching for `/store/items` uses Valkey with cursor pagination keys; WebSocket chat fans out over Valkey pub/sub and persists to Postgres.

## Testing and quality

- `bun run lint` (Oxlint across web + api)
- `bun run --cwd apps/web test` runs unit tests plus Playwright smoke coverage for `/` and `/store` (install browsers once via `bunx playwright install --with-deps chromium`)
- `bun run --cwd apps/web test:perf` enforces Web Vitals budgets via Playwright (`@perf` tag) and emits traces/HARs under the test results directory for regression triage
- `scripts/perf-audit` (requires `@lhci/cli` globally) to run Lighthouse CI against the built web assets

## Git hooks

- Hooks are powered by [Lefthook](https://github.com/evilmartians/lefthook) and run `bun run lint` and the web test suite on pre-commit.
- Install hooks locally with `bunx lefthook install` after dependencies are installed.
- If you see `Cannot find module 'lefthook-windows-arm64/bin/lefthook.exe'`, reinstall with optional deps enabled (recommended: `bun install`, or `npm ci --include=optional`).
- Set `LEFTHOOK=0` in CI or for emergency bypass to skip hook execution.

## Performance guardrails

- Home route ships minimal HTML/CSS with cache headers; chat/WebSocket code only loads on the chat route.
- UnoCSS + Lightning CSS minimize CSS payloads; Vite 8 (Rolldown) powers builds.
- Speculation Rules pre-render/prefetch likely navigations; View Transitions provide smooth navigation without client runtime bloat.
- Partytown is optional for isolating third-party scripts off the main thread.
- Stick with SSR/resumability for Lighthouse: keep prod SSR so HTML streams fast with edge caching; reserve SSG only for fully static routes that benefit from pre-rendered HTML without runtime data dependencies.
- Web Vitals budgets (FCP ≤ 1.8s home/2.0s store, LCP ≤ 2.5s home/2.8s store, TBT ≤ 150ms home/175ms store) are enforced in Playwright; investigate regressions using the saved traces and HARs from `apps/web/tests/performance.spec.ts`.

## TLS guidance

- Mount `fullchain.pem` and `privkey.pem` into `infra/nginx/tls/` for Nginx.
- HTTP/3 and Early Hints are enabled; an HTTP port 80 listener redirects to HTTPS.
