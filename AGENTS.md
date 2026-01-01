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
- **Infrastructure (`infra/` + `docker-compose.yml`):**
  - Traefik terminates TLS and routes `prometheus.dev` traffic to web/API containers.
  - Postgres 16 + Valkey 8 containers with healthchecks and persistent volumes.
  - Dynamic Traefik config generated for dev via `scripts/compose-utils.ts` (writes `infra/traefik/dynamic/stack.yml`).

## Dev and runtime flow
- **Local dev entrypoint:** `bun run dev` (runs Compose services, ensures `stack.yml`, starts Qwik dev server on 4173 with HTTPS routed through Traefik at `https://prometheus.dev`).
- **Direct targets:** `bun run dev:web` and `bun run dev:api` start each app individually (requires backing services for API).
- **Build/preview:** `bun run build` builds both apps; `bun run preview` starts Traefik/containers and runs `vite preview` for the web app.
- **API base resolution:** Frontend resolves API origin via `API_BASE`/`VITE_API_BASE` (absolute URL or `/api` prefix). Default dev fallback is `http://127.0.0.1:4000`. Set the envs explicitly when front/back aren’t co-located.
- **Database bootstrap:** When `RUN_MIGRATIONS=1`, the API runs Drizzle migrations + seed (`apps/api/src/db/prepare.ts`). Compose dev flow sets this automatically via scripts.
- **Networking:** Traefik expects `prometheus.dev` to resolve to localhost. On WSL/non-macOS, set `DEV_WEB_UPSTREAM` if `host.docker.internal` is unsuitable.

## Compatibility and constraints
- **Runtimes:** Prefer Bun for scripts and package management. Avoid switching to npm/yarn. TypeScript target is modern (`typescript@6.0.0-dev`); Vite 8 beta + Qwik require up-to-date Node headers but the runtime is Bun.
- **Fragments:** Keep fragment payloads binary-compatible with `apps/web/src/fragment/binary.ts` and API encoders. Changes to fragment schemas must update both sides and related tests.
- **Caching:** Valkey cache keys for store items come from `buildStoreItemsCacheKey`; invalidation is coupled to realtime events. Preserve this coupling when modifying store logic.
- **Rate limits and payload limits:** Respect API constraints in `apps/api/src/server/app.ts` (prompt length, body size, WS quotas). Frontend UX should surface these limits rather than bypass them.
- **TLS/hosts:** Dev HTTPS assumes mkcert-style certs under `infra/traefik/certs`. Don’t check private keys into version control; reuse existing paths.

## Repo conventions and checks
- **Scripts:** Use root scripts before custom commands (`dev`, `build`, `preview`, `lint`, `typecheck`, `test`). API linting uses Oxlint configs in `apps/api/.oxlintrc.json`.
- **Testing:** Root `bun run test` executes API tests; `bun run typecheck` covers both workspaces. Add targeted tests in `apps/api/tests/` or `apps/web/src/**/*.test.tsx`.
- **Formatting:** API files use Oxlint/formatter configs (`.oxlintrc.json`, `.oxfmtrc.json`). Frontend follows project styling in `src/global.css` and component patterns (Qwik components with `$` suffix).
- **Git hooks:** `bun run hooks:install` sets `.githooks`; commit messages should be conventional and meaningful.

## File map (quick pointers)
- **Frontend:** `apps/web/src/root.tsx` (app shell), `routes/` (pages/layout/head), `components/` (RouteMotion, FragmentShell), `fragment/` (client/server codecs + plan handling), `public/` (PWA assets/service worker).
- **API:** `apps/api/src/server/app.ts` (Elysia setup), `auth/` (Better Auth config), `fragments/` (planner/renderers/binary codec), `db/` (Drizzle schema/migrations), `services/cache.ts` (Valkey), `server/*` (network, rate limit, realtime).
- **Infra:** `docker-compose.yml` (service graph), `infra/traefik` (static + dynamic routing), `infra/db/init.sql`, `infra/valkey/valkey.conf`, `scripts/*.ts` (compose helpers, preview/dev).

## Contribution dos and don’ts
- **Do** keep frontend/API contracts in sync, especially fragment schemas and cache headers.
- **Do** prefer HTTPS + Traefik flow for testing view transitions and HMR in dev.
- **Do** document new env vars and update this file when site behavior or compatibility assumptions change.
- **Don’t** replace Bun tooling with npm/yarn or add global installs when a Bun script exists.
- **Don’t** bypass rate limiting, cache invalidation hooks, or fragment sanitization paths.

When in doubt, mirror existing patterns in the same directory and keep fragment + API interfaces aligned. Update this document if you introduce new rules or workflows.
