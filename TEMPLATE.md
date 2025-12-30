# Prometheus Site template

Use this template to set up local environments, opt into optional features, and understand customization boundaries. Keep it up to date when workflows change.

## Setup

- Clone and install: `git clone <repo> && cd prometheus-site && bun install` (use `--ignore-scripts` if you are bootstrapping inside CI).
- Configure env: copy `.env.example` to `.env` and adjust ports or hosts as needed.
- Run the stack: `bun run dev` for web + API, or `make dev` to start the docker-compose **dev** profile. Stop with `Ctrl+C`; view logs with `make logs`.
- Preview build: `bun run build` then `bun run preview` (expects the API to be running, e.g., `bun run --cwd apps/api dev`).
- Quality gates: `bun run lint` and `bun run test` (web tests live under `apps/web/tests`).
- TLS: mkcert-issued certs live under `infra/traefik/certs`; run `bun run certs:mkcert` (WSL Bash) or `./scripts/setup-mkcert.ps1` (PowerShell) when you need trusted HTTPS locally.

## Opt-in features

- **Partytown**: set `ENABLE_PARTYTOWN=1` to isolate third-party scripts off the main thread.
- **Audit mode**: `VITE_DEV_AUDIT=1 bun run dev` disables HMR and minifies optimized deps for Lighthouse/devtools payload checks.
- **Remote/HTTPS dev**: set `HMR_PROTOCOL=wss` plus `HMR_HOST`, `HMR_PORT`, and `HMR_CLIENT_PORT` when fronting dev with HTTPS or port-forwarding; Traefik auto-wires TLS when `DEV_HTTPS=1` or a non-localhost host is used.
- **Docker prod profile**: `bun run docker:prod` runs Traefik + preview web + API on ports 80/443; add `prometheus.prod` to `/etc/hosts`.

## Customization boundaries

- Favor SSR/resumability: keep renders pure and move DOM access into `useVisibleTask$`; avoid non-serializable values in QRL handlers.
- Generated assets stay untouched: never edit `apps/web/public/assets/app.css`; use `apps/web/src/global.css` or route-scoped styles instead.
- Entry points stay stable: prefer route or component edits over changes to `apps/web/src/entry.*` unless absolutely required.
- Keep performance budgets in mind: defer or lazy-load heavy code paths, and avoid adding global client bundles.

## SSR safety checklist

- Keep renders pure: do not access `window`, `document`, `localStorage`, or `matchMedia` outside `useVisibleTask$`/`useTask$`, and guard with `typeof document !== 'undefined'` when you do.
- Return only JSON-serializable data from `routeLoader$`, `routeAction$`, and `server$` functions—convert `Date`/`URL`/`Map`/`Set`/`BigInt` values to primitives first.
- Wrap handlers in `$()` and keep them serializable; move DOM access into `useVisibleTask$` so QRLs avoid capturing non-serializable references.
- When wiring animations or browser APIs, cancel in-flight work, respect `prefers-reduced-motion`, and avoid long-running work on the main thread.

## When to add a component (checklist)

- Place shared UI under `apps/web/src/components/` (animations in `components/animations/`); route-only pieces should live alongside their route files.
- Make handlers QRL-safe: use `$()` and avoid capturing `window`, `document`, or other non-serializable values inside render paths.
- Keep styles scoped: prefer route-scoped styles or utilities; add structural/above-the-fold rules to `apps/web/src/routes/critical.css` only when necessary.
- Prime navigation wisely: use Speculation Rules and View Transitions where appropriate, but keep the initial payload minimal.
- Update `apps/web/src/config/page-config.json` when new routes need speculation or prerender entries, and align nav links in the layout.

## Component reuse rules

- Keep `apps/web/src/components` for UI shared across multiple routes; feature-specific helpers belong alongside their routes (e.g., `apps/web/src/routes/ai/`).
- Delete or inline single-use abstractions instead of adding shared helpers without clear reuse.
- Keep props narrow and explicit; wire feature-only behavior at the route level instead of passing generic option bags.
- Critical CSS is structural only: keep `apps/web/src/routes/critical.css` limited to layout stability (spacing, sizing, fallback visibility).
  Move visual polish, animations, and non-critical states into scoped or global styles so critical CSS stays lean and avoid touching generated CSS.
