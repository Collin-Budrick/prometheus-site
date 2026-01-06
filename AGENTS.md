# AGENTS

This monorepo hosts the **Fragment Prime** site: a Qwik frontend that streams binary-rendered fragments from a Bun + Elysia API. Use this file as the canonical guide for how the site works, what is compatible, and repo-specific rules.

## Architecture overview

- **Workspaces:** Managed with Bun (`bun@1.3.5`). Frontend lives in `apps/web`, API in `apps/api`. Shared tooling lives under `scripts/` and `infra/`.
- **Frontend (`apps/web`):** Qwik + Qwik City SPA/SSR with view transitions. Pages hydrate a `FragmentShell` that:
  - Fetches a render plan from the API (`/fragments/plan?path=...`).
  - Streams fragment payloads from the API (`/fragments?id=...`), decoding binary payloads client-side.
  - Supports speculation rules, preloading, and fragment-aware navigation (`data-fragment-link`).
  - Uses Tailwind v4 + Lightning CSS (see `src/global.css`) and motion transitions (`RouteMotion`).
- **API (`apps/api`):** Bun + Elysia service with Drizzle/Postgres and Valkey (Redis-compatible) for cache/pubsub. Provides:
  - Fragment planner/renderer endpoints consumed by the frontend.
  - Store inventory API with Valkey-backed cache and WebSocket realtime fanout.
  - Authentication via Better Auth (env-configurable).
  - Health checks, chat echo endpoint, and AI prompt validation limits.
- **WebTransport (`apps/webtransport`):** Go HTTP/3 sidecar that upgrades CONNECT requests and streams fragment binaries from the API over WebTransport.
- **Infrastructure (`infra/` + `docker-compose.yml`):**
  - Caddy terminates TLS and routes `prometheus.dev` traffic to web/API containers.
  - Caddy serves HTTP over TCP (h1/h2); UDP 4444 is bound to the WebTransport sidecar for HTTP/3 WebTransport sessions.
  - Postgres 16 + Valkey 8 containers with healthchecks and persistent volumes.
  - Dynamic Caddy config generated for dev via `scripts/compose-utils.ts` (writes `infra/caddy/Caddyfile`).

## Dev and runtime flow

- **Local dev entrypoint:** `bun run dev` (runs Compose services, ensures the Caddyfile, starts Qwik dev server on 4173 with HTTPS routed through Caddy at `https://prometheus.dev`).
- **Direct targets:** `bun run dev:web` and `bun run dev:api` start each app individually (requires backing services for API).
- **Fragment HMR (dev):** Vite watches `apps/api/src/fragments` and emits `fragments:refresh` to re-fetch fragment payloads with `refresh=1` (dev-only); requires the API running from source (dev/watch) and plan changes still require a reload.
- **Build/preview:** `bun run build` builds both apps; `bun run preview` starts Caddy/containers and runs `vite preview` for the web app.
- **Feature flags (dev/preview defaults):** `VITE_ENABLE_PREFETCH`, `VITE_ENABLE_WEBTRANSPORT_FRAGMENTS`, `VITE_ENABLE_WEBTRANSPORT_DATAGRAMS`, `VITE_ENABLE_FRAGMENT_COMPRESSION`, `VITE_ENABLE_ANALYTICS`, `VITE_REPORT_CLIENT_ERRORS`, and API `ENABLE_WEBTRANSPORT_FRAGMENTS` default to on.
- **WebTransport envs:** `WEBTRANSPORT_API_BASE` (defaults to `http://api:4000`), `WEBTRANSPORT_LISTEN_ADDR` (defaults to `:4444`), `WEBTRANSPORT_CERT_PATH`, `WEBTRANSPORT_KEY_PATH`, `WEBTRANSPORT_ALLOWED_ORIGINS`, `WEBTRANSPORT_ALLOW_ANY_ORIGIN`, `WEBTRANSPORT_ENABLE_DATAGRAMS` (defaults to on), `WEBTRANSPORT_MAX_DATAGRAM_SIZE` (defaults to `1200`), `PROMETHEUS_WEBTRANSPORT_PORT` (defaults to `4444` for host UDP), `VITE_WEBTRANSPORT_BASE` (optional client override).
- **API base resolution:** Frontend resolves API origin via `API_BASE`/`VITE_API_BASE` (absolute URL or `/api` prefix). Default dev fallback is `http://127.0.0.1:4000`. Set the envs explicitly when front/back aren’t co-located.
- **Database bootstrap:** When `RUN_MIGRATIONS=1`, the API runs Drizzle migrations + seed (`apps/api/src/db/prepare.ts`). Compose dev flow sets this automatically via scripts.
- **Networking:** Caddy expects `prometheus.dev` to resolve to localhost. On WSL/non-macOS, set `DEV_WEB_UPSTREAM` if `host.docker.internal` is unsuitable.

## Compatibility and constraints

- **Runtimes:** Prefer Bun for scripts and package management. Avoid switching to npm/yarn. TypeScript target is modern (`typescript@6.0.0-dev`); Vite 8 beta + Qwik require up-to-date Node headers but the runtime is Bun.
- **Fragments:** Keep fragment payloads binary-compatible with `apps/web/src/fragment/binary.ts` and API encoders. Changes to fragment schemas must update both sides and related tests.
- **Early hints:** Fragment plans may include `earlyHints` for shell assets only (CSS, fonts, critical JS); never include fragment payloads or WebTransport URLs.
- **Caching:** Valkey cache keys for store items come from `buildStoreItemsCacheKey`; invalidation is coupled to realtime events. Preserve this coupling when modifying store logic.
- **Rate limits and payload limits:** Respect API constraints in `apps/api/src/server/app.ts` (prompt length, body size, WS quotas). Frontend UX should surface these limits rather than bypass them.
- **TLS/hosts:** Dev HTTPS assumes mkcert-style certs under `infra/caddy/certs` (shared with Caddy and WebTransport). Don’t check private keys into version control; reuse existing paths.
- **WebTransport TLS:** Chrome may require WebTransport developer mode for mkcert/local CAs (`chrome://flags/#enable-webtransport-developer-mode` or launch with `--enable-features=WebTransportDeveloperMode`; `chrome-devtools-mcp` supports `--acceptInsecureCerts`/`--chromeArg`).

## Repo conventions and checks

- **Scripts:** Use root scripts before custom commands (`dev`, `build`, `preview`, `lint`, `typecheck`, `test`). API linting uses Oxlint configs in `apps/api/.oxlintrc.json`.
- **Testing:** Root `bun run test` executes API tests; `bun run typecheck` covers both workspaces. Add targeted tests in `apps/api/tests/` or `apps/web/src/**/*.test.tsx`.
- **Formatting:** API files use Oxlint/formatter configs (`.oxlintrc.json`, `.oxfmtrc.json`). Frontend follows project styling in `src/global.css` and component patterns (Qwik components with `$` suffix).
- **Git hooks:** `bun run hooks:install` sets `.githooks`; commit messages should be conventional and meaningful.

## File map (quick pointers)

- **Frontend:** `apps/web/src/root.tsx` (app shell), `routes/` (pages/layout/head), `components/` (RouteMotion, FragmentShell), `fragment/` (client/server codecs + plan handling), `public/` (PWA assets/service worker).
- **API:** `apps/api/src/server/app.ts` (Elysia setup), `auth/` (Better Auth config), `fragments/` (planner/renderers/binary codec), `db/` (Drizzle schema/migrations), `services/cache.ts` (Valkey), `server/*` (network, rate limit, realtime).
- **Infra:** `docker-compose.yml` (service graph), `infra/caddy` (Caddyfile routing), `infra/db/init.sql`, `infra/valkey/valkey.conf`, `scripts/*.ts` (compose helpers, preview/dev).
- **WebTransport:** `apps/webtransport/main.go` (HTTP/3 server), `apps/webtransport/Dockerfile`.

## Contribution dos and don’ts

- **Do** keep frontend/API contracts in sync, especially fragment schemas and cache headers.
- **Do** prefer HTTPS + Caddy flow for testing view transitions and HMR in dev.
- **Do** document new env vars and update this file when site behavior or compatibility assumptions change.
- **Don’t** replace Bun tooling with npm/yarn or add global installs when a Bun script exists.
- **Don’t** bypass rate limiting, cache invalidation hooks, or fragment sanitization paths.

When in doubt, mirror existing patterns in the same directory and keep fragment + API interfaces aligned. Update this document if you introduce new rules or workflows.
