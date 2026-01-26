# AGENTS

This monorepo hosts the **Fragment Prime** site: a Qwik frontend that streams binary-rendered fragments from a Bun + Elysia API. Use this file as the canonical guide for how the site works, what is compatible, and repo-specific rules.

## Architecture overview

- **Workspaces:** Managed with Bun (`bun@1.3.5`). Site entrypoint lives in `apps/site`, API entrypoint lives in `packages/platform/src/entrypoints/api.ts`. Core, platform, UI, and features live under `packages/`.
- **Core (`packages/core`):** Fragment planning/rendering, binary codecs, client streaming helpers, fragment registry, and prefetch/speculation utilities.
- **Platform (`packages/platform`):** Bun + Elysia integration, env/config resolution, DB/cache clients, rate limiting, and API route composition.
- **UI (`packages/ui`):** Design system (global styles, RouteMotion, Dock, FragmentCard, toggles), no data fetching.
- **Features (`packages/features/*`):** Auth, Store, Messaging, Lab (self-contained front/back logic).
- **Site (`apps/site`):** Qwik + Qwik City SPA/SSR composition layer, FragmentShell, routes, branding/copy.
- **API (platform entrypoint):** Thin Bun entry that boots the platform server and registers site fragment definitions.
- **WebTransport (`apps/webtransport`):** Go HTTP/3 sidecar that upgrades CONNECT requests and streams fragment binaries from the API over WebTransport.
- **Infrastructure (`infra/` + `docker-compose.yml`):**
  - Caddy terminates TLS and routes `prometheus.dev` traffic to web/API containers.
  - Caddy serves HTTP over TCP (h1/h2); UDP 4444 is bound to the WebTransport sidecar for HTTP/3 WebTransport sessions.
  - Postgres 16 + Valkey 8 containers with healthchecks and persistent volumes.
  - Dynamic Caddy config generated for dev via `scripts/compose-utils.ts` (writes `infra/caddy/Caddyfile`).

## Dev and runtime flow

- **Local dev entrypoint:** `bun run dev` (runs Compose services, ensures the Caddyfile, starts Qwik dev server on 4173 with HTTPS routed through Caddy at `https://prometheus.dev`).
- **Capacitor Android sync (dev/preview):** `bun run dev` and `bun run preview` run `cap sync android`. Dev defaults to the live dev host; preview uses bundled assets unless `CAPACITOR_SERVER_URL` is set. The scripts install site deps (`bun install --filter site`) if the CLI is missing. On Windows, the sync falls back to running the Capacitor CLI with Node for tar extraction compatibility.
- **Direct targets:** `bun run dev:web` and `bun run dev:api` start each app individually (requires backing services for API).
- **Fragment HMR (dev):** Vite watches `apps/site/src/fragments` and emits `fragments:refresh` to re-fetch fragment payloads with `refresh=1` (dev-only); requires the API running from source (dev/watch) and plan changes still require a reload.
- **Build/preview:** `bun run build` builds both apps; `bun run preview` starts Caddy/containers and runs `vite preview` for the site.
- **Capacitor build:** `VITE_CAPACITOR=1` enables static generation for mobile builds (`bun run --cwd apps/site build:capacitor`).
- **Capacitor server URL:** `CAPACITOR_SERVER_URL` overrides the Capacitor WebView host; if unset, it falls back to `PROMETHEUS_WEB_HOST` + `PROMETHEUS_HTTPS_PORT` when present.
- **Capacitor device host:** `PROMETHEUS_DEVICE_HOST` (IP or `127.0.0.1` for `adb reverse`, default `192.168.1.138` in dev; set to `off` to disable) + optional `PROMETHEUS_DEVICE_WEB_PORT` (default `4173`) + `PROMETHEUS_DEVICE_PROTOCOL` (default `http`) override the live host in dev/preview; preview uses bundled assets unless `PROMETHEUS_DEVICE_HOST`/`CAPACITOR_SERVER_URL` are set. WebTransport flags default off in this mode unless explicitly set.
- **Android auto-deploy:** `PROMETHEUS_ANDROID_AUTODEPLOY` (default on) runs `gradlew assembleDebug`, `adb install -r`, optional `adb reverse`, and launches the app. Override with `PROMETHEUS_ANDROID_BUILD`, `PROMETHEUS_ANDROID_INSTALL`, `PROMETHEUS_ANDROID_LAUNCH`, `PROMETHEUS_ANDROID_REVERSE`, `PROMETHEUS_ANDROID_SERIAL`, and `PROMETHEUS_ADB_PATH`. USB wait can be toggled via `PROMETHEUS_ANDROID_WAIT` (default on) and `PROMETHEUS_ANDROID_WAIT_TIMEOUT_MS` (default `30000`).
- **Feature flags (dev/preview defaults):** `VITE_ENABLE_PREFETCH`, `VITE_ENABLE_WEBTRANSPORT_FRAGMENTS`, `VITE_ENABLE_WEBTRANSPORT_DATAGRAMS`, `VITE_ENABLE_FRAGMENT_COMPRESSION`, `VITE_ENABLE_ANALYTICS`, `VITE_HIGHLIGHT_SESSION_RECORDING`, and API `ENABLE_WEBTRANSPORT_FRAGMENTS` default to on. `VITE_ENABLE_FRAGMENT_STREAMING` defaults off; `VITE_FRAGMENT_VISIBILITY_MARGIN` defaults to `0px` and `VITE_FRAGMENT_VISIBILITY_THRESHOLD` defaults to `0`. `VITE_ENABLE_HIGHLIGHT` defaults off; `VITE_HIGHLIGHT_SAMPLE_RATE` defaults to `0.1` when unset.
- **Fragment cache TTLs:** `FRAGMENT_PLAN_TTL` (seconds, default `180`), `FRAGMENT_PLAN_STALE_TTL` (seconds, default `300`), and `FRAGMENT_INITIAL_TTL` (seconds, default `180`) control fragment plan + initial payload cache lifetimes.
- **WebTransport envs:** `WEBTRANSPORT_API_BASE` (defaults to `http://api:4000`), `WEBTRANSPORT_LISTEN_ADDR` (defaults to `:4444`), `WEBTRANSPORT_CERT_PATH`, `WEBTRANSPORT_KEY_PATH`, `WEBTRANSPORT_ALLOWED_ORIGINS`, `WEBTRANSPORT_ALLOW_ANY_ORIGIN`, `WEBTRANSPORT_ENABLE_DATAGRAMS` (defaults to on), `WEBTRANSPORT_MAX_DATAGRAM_SIZE` (defaults to `1200`), `PROMETHEUS_WEBTRANSPORT_PORT` (defaults to `4444` for host UDP), `VITE_WEBTRANSPORT_BASE` (optional client override).
- **P2P relay + ICE envs:** `VITE_P2P_RELAY_BASES`/`P2P_RELAY_BASES` (comma/newline list of API bases for mailbox relays; defaults to resolved API base), `VITE_P2P_NOSTR_RELAYS`/`P2P_NOSTR_RELAYS` (comma/newline list of `ws(s)` Nostr relays), `VITE_P2P_WAKU_RELAYS`/`P2P_WAKU_RELAYS` (comma/newline list of Waku bootstrap multiaddrs, optionally prefixed with `waku:`), `VITE_P2P_CRDT_SIGNALING`/`P2P_CRDT_SIGNALING` (comma/newline list of y-webrtc signaling URLs), `VITE_P2P_PEERJS_SERVER`/`P2P_PEERJS_SERVER` (PeerJS server URL), and `VITE_P2P_ICE_SERVERS`/`P2P_ICE_SERVERS` (JSON array or comma list of ICE URLs).
- **Push envs:** `PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY`, `PUSH_VAPID_SUBJECT` (enable web push notifications for P2P mailbox updates).
- **Auth bootstrap envs:** `AUTH_BOOTSTRAP_PRIVATE_KEY` (ES256 JWK used by the API to sign offline bootstrap tokens), `VITE_AUTH_BOOTSTRAP_PUBLIC_KEY`/`AUTH_BOOTSTRAP_PUBLIC_KEY` (public JWK used by the client to verify offline bootstrap tokens).
- **API base resolution:** Frontend resolves API origin via `API_BASE`/`VITE_API_BASE` (absolute URL or `/api` prefix). Default dev fallback is `http://127.0.0.1:4000`. Set the envs explicitly when front/back aren’t co-located.
- **Public base (IPFS/PWA):** `VITE_PUBLIC_BASE` controls the Vite `base` path (use `./` for IPFS/gateway hosting so assets resolve under the CID path).
- **P2P relay/signaling envs:** `VITE_P2P_RELAY_BASES` (HTTP mailbox relays), `VITE_P2P_NOSTR_RELAYS` (wss relays for discovery/prekeys), `VITE_P2P_WAKU_RELAYS` (Waku multiaddrs), and `VITE_P2P_CRDT_SIGNALING` (y-webrtc signaling list; if empty, falls back to `/yjs`).
- **Database bootstrap:** When `RUN_MIGRATIONS=1`, the API runs Drizzle migrations + seed (`packages/platform/src/db/prepare.ts`). Compose dev flow sets this automatically via scripts.
- **Networking:** Caddy expects `prometheus.dev` to resolve to localhost. On WSL/non-macOS, set `DEV_WEB_UPSTREAM` if `host.docker.internal` is unsuitable.

## Compatibility and constraints

- **Runtimes:** Prefer Bun for scripts and package management. Avoid switching to npm/yarn. TypeScript target is modern (`typescript@6.0.0-dev`); Vite 8 beta + Qwik require up-to-date Node headers but the runtime is Bun.
- **Fragments:** Keep fragment payloads binary-compatible with `packages/core/src/fragment/binary.ts` and API encoders. Changes to fragment schemas must update both sides and related tests.
- **Early hints:** Fragment plans may include `earlyHints` for shell assets only (CSS, fonts, critical JS); never include fragment payloads or WebTransport URLs.
- **Caching:** Valkey cache keys for store items come from `buildStoreItemsCacheKey`; invalidation is coupled to realtime events. Preserve this coupling when modifying store logic.
- **Rate limits and payload limits:** Respect API constraints in `packages/platform/src/server/app.ts` (prompt length, body size, WS quotas). Frontend UX should surface these limits rather than bypass them.
- **TLS/hosts:** Dev HTTPS assumes mkcert-style certs under `infra/caddy/certs` (shared with Caddy and WebTransport). Don’t check private keys into version control; reuse existing paths.
- **WebTransport TLS:** Chrome may require WebTransport developer mode for mkcert/local CAs (`chrome://flags/#enable-webtransport-developer-mode` or launch with `--enable-features=WebTransportDeveloperMode`; `chrome-devtools-mcp` supports `--acceptInsecureCerts`/`--chromeArg`).

## Repo conventions and checks

- **Scripts:** Use root scripts before custom commands (`dev`, `build`, `preview`, `lint`, `typecheck`, `test`). API linting uses Oxlint configs in `packages/platform/.oxlintrc.json`.
- **Testing:** Root `bun run test` executes API tests; `bun run typecheck` covers site + packages. Add targeted tests in `packages/platform/tests/` or `apps/site/src/**/*.test.tsx`.
- **Formatting:** API files use Oxlint/formatter configs (`.oxlintrc.json`, `.oxfmtrc.json`). Frontend follows project styling in `packages/ui/src/global.css` and component patterns (Qwik components with `$` suffix).
- **Git hooks:** `bun run hooks:install` sets `.githooks`; commit messages should be conventional and meaningful.

## File map (quick pointers)

- **Site:** `apps/site/src/root.tsx` (app shell), `apps/site/src/routes/` (pages/layout/head), `apps/site/src/features/fragments/` (FragmentShell), `apps/site/src/fragments/` (site fragment definitions).
- **Core:** `packages/core/src/fragment/` (types/codec/planner/service), `packages/core/src/app/` (client extras).
- **Platform/API:** `packages/platform/src/server/app.ts` (Elysia setup), `packages/platform/src/db/schema.ts` (schema), `packages/platform/src/cache.ts` (Valkey), `packages/platform/src/server/fragments.ts` (fragment routes).
- **Features:** `packages/features/auth/src/server.ts`, `packages/features/store/src/api.ts`, `packages/features/messaging/src/api.ts`, `packages/features/lab/src/pages/Lab.tsx`.
- **Infra:** `docker-compose.yml` (service graph), `infra/caddy` (Caddyfile routing), `infra/db/init.sql`, `infra/valkey/valkey.conf`, `scripts/*.ts` (compose helpers, preview/dev).
- **WebTransport:** `apps/webtransport/main.go` (HTTP/3 server), `apps/webtransport/Dockerfile`.

## Contribution dos and don’ts

- **Do** keep frontend/API contracts in sync, especially fragment schemas and cache headers.
- **Do** prefer HTTPS + Caddy flow for testing view transitions and HMR in dev.
- **Do** document new env vars and update this file when site behavior or compatibility assumptions change.
- **Don’t** replace Bun tooling with npm/yarn or add global installs when a Bun script exists.
- **Don’t** bypass rate limiting, cache invalidation hooks, or fragment sanitization paths.

When in doubt, mirror existing patterns in the same directory and keep fragment + API interfaces aligned. Update this document if you introduce new rules or workflows.
