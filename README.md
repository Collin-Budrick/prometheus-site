# Prometheus Site Monorepo

Performance-first monorepo running a Qwik City SSR web app and a Bun + Elysia API, wired together with Postgres and Valkey.

## Quick start (Bun)

```bash
git clone <repo>
cd prometheus-site
bun install
bun run dev          # web + api dev servers
# or run the built preview once assets exist:
bun run preview
```

## Architecture

- **apps/web** - Qwik City SSR with UnoCSS + Lightning CSS, Speculation Rules, View Transitions, optional Partytown.
- **apps/api** - Bun + Elysia REST/WebSocket service using Drizzle ORM (Postgres) and Valkey for cache/pubsub.
- **infra/** - Traefik dynamic config, Postgres init scripts, Valkey config.
- **docker-compose** - Dev and prod profiles bundling web, api, db, valkey, and Traefik.
- **scripts/perf-audit** - Lighthouse CI helper for bundle/perf verification.

### Ports

- Web: `4173`
- API: `4000`
- Postgres: `5433`
- Valkey: `6379`
- Traefik edge: `80` (HTTP), `443` (HTTPS + HTTP/3)

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
- `bun run docker:prod` - builds and runs Traefik + web preview + API containers.
- `VITE_DEV_AUDIT=1 bun run dev` - disables HMR/WebSocket and minifies optimized deps so Lighthouse/devtools audits avoid the Vite client payload and back/forward cache blockers. Leave this unset in normal dev shells; audit mode forces full reloads because HMR is off.

## apps/web map (where to find things)

- Routes and layouts: `apps/web/src/routes/[locale]/...` (shared layout in `layout.tsx`, home in `index.tsx`).
- Components: `apps/web/src/components/` (animations under `components/animations/`).
- Critical/non-critical CSS: `apps/web/src/routes/critical.css` and `apps/web/src/global.css` (generated output at `apps/web/public/assets/app.css`).
- Config: `apps/web/src/config/` (page-config JSON/TS, env parsing, speculation rules, third-party config).
- Server-only helpers: `apps/web/src/server/` or route `server$`/loader/action files.
- Scripts/tooling: `apps/web/scripts/`.
- Tests: `apps/web/tests/` and `apps/web/src/routes/*.test.ts`.
- Public assets: `apps/web/public/`.

## Local development

```bash
bun install --ignore-scripts
cp .env.example .env
make dev
```

This runs docker-compose in the **dev** profile with hot reload for both apps. Stop with `Ctrl+C`. View logs with `make logs`.

### TLS (mkcert)

Traefik terminates TLS using mkcert-issued certificates stored in `infra/traefik/certs`.

WSL (Bash):

```bash
bun run certs:mkcert
```

Windows (PowerShell):

```powershell
.\scripts\setup-mkcert.ps1
```

If you run mkcert inside WSL but browse from Windows, import the WSL root CA into Windows trust (`mkcert -CAROOT` shows the CA path).

### Docker/WSL HMR tips

The Vite dev server defaults to WebSocket HMR (`apps/web/src/config/env.ts`) and wires those settings through the `server.hmr` block in `apps/web/vite.config.ts`. When running inside Docker or WSL, set `HMR_HOST` to an address reachable by the browser (e.g., your host IP or `localhost` when port-forwarded) and `HMR_CLIENT_PORT` to the forwarded dev port so the Vite client can open the WebSocket. Avoid `VITE_HMR_POLLING=1` unless necessary; it forces polling and disables the faster WebSocket path.

#### Remote/HTTPS dev checklist

- Set `HMR_PROTOCOL=wss` so the Vite client upgrades over TLS when you front the dev server with HTTPS.
- `bun run dev` auto-switches to `wss` + `443` when `infra/traefik/dynamic/tls.yml` exists and you set a non-localhost `HMR_HOST`/`WEB_HOST` (or `DEV_HTTPS=1`); override with `DEV_HTTPS=0` or explicit `HMR_*` env vars if needed.
- Align `HMR_PORT` with the dev server port you expose from the container/VM (usually `WEB_PORT`).
- Set `HMR_CLIENT_PORT` to the browser-facing port (the one you access in the address bar after forwarding or reverse-proxying).

Example `.env` snippet for a containerized HTTPS setup:

```bash
# HMR over HTTPS
HMR_PROTOCOL=wss
HMR_HOST=localhost
HMR_PORT=4173
HMR_CLIENT_PORT=443
```

These values are read in `apps/web/src/config/env.ts` and populate the `server.hmr` block so Vite can build the correct WebSocket URL when running behind HTTPS or port-forwarding.

## Production-like

```bash
bun run docker:prod
```

The **prod** profile runs Traefik on ports 80/443 and serves the preview web container. Add `prometheus.prod` to your hosts file so the router can match the hostname, and run mkcert so HTTPS is trusted.

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

## Contributing (Bun workflow)

- Install: `bun install`
- Lint: `bun run lint`
- Unit/e2e tests: `bun run test` (or `bun run --cwd apps/web test` for route-level coverage)
- Dev server: `bun run dev`
- Preview build: `bun run build` then `bun run preview`
- Run lint + tests before opening a PR; rerun `bun run preview` after SSR/i18n changes to ensure the built output matches.

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
