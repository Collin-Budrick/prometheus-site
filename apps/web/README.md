# Web (Qwik City)

Qwik City SSR app with UnoCSS, Lightning CSS, view transitions, speculation rules, and optional Partytown for third-party isolation.

## Scripts

- `bun run dev` – start SSR dev server with hot module reloading.
- `bun run build` – build client + SSR output with Lightning CSS minification.
- `bun run preview` – preview the SSR build.
- `bun run lint` – run Oxlint linting.
- `bun run format` – apply Oxfmt formatting.
- `bun run test` – execute Qwik tests.

## Bundle analysis

- `VITE_ANALYZE=1 bun run --cwd apps/web build` – generates bundle inspection output. Visualizer stats land in `apps/web/dist/stats/rollup-visualizer.html`, and Inspect artifacts live under `apps/web/dist/stats/inspect/`.

## Perf notes

- Home route ships minimal HTML/CSS with immutable caching headers.
- Speculation Rules prerender `/store` and prefetch `/chat` when supported.
- View Transitions enable smooth navigation without extra JS runtimes.
- Chat/WebSocket and AI logic only load on their respective routes.
- Partytown runs third-party tags off the main thread when `VITE_ENABLE_PARTYTOWN=true` (defaults on in prod). Worker assets are copied into `/public/~partytown/` during build via the Partytown Vite plugin.

## Styling conventions

- UnoCSS powers all on-demand utilities. Prefer utilities/shortcuts over ad-hoc global CSS; the `light:` variant targets `.light`
  or `[data-theme="light"]` while the built-in `dark:` variant still scopes to `.dark`.
- Variant grouping is enabled (`hover:(opacity-80 underline) focus:(ring-2 ring-offset-2)`) alongside layout/text shortcuts
  (`stack-md`, `stack-lg`, `text-body`, `text-muted`, `title-md`, `title-lg`) to keep spacing and typography consistent.
- Icons are self-hosted through UnoCSS `presetIcons` with tree-shaken collections (e.g. Solar); use `i-solar:moon-stars-bold`
  or similar utility classes to embed icons without external fetches.
- Keep global styles microscopic (reset + tokens only). Route-only animations/layout tweaks should live next to the route with
  `useStylesScoped$`/`routeStyles$` for critical extraction.
- Lightning CSS handles transforms/minification; run `bun run check:css` to fail fast if `src/global.css` exceeds the budget
  before builds and CI linting.

## Configuration

- `VITE_SPECULATION_RULES` – enable Speculation Rules prefetch/prerender hints for likely next routes (defaults on in prod, off in
  dev to avoid interfering with HMR).
- `VITE_ROUTE_VIEW_TRANSITIONS` – wrap route switches with the native View Transitions API when supported (defaults on in prod,
  off in dev).
- `PRERENDER_ORIGIN` – origin used by `scripts/prerender.ts` for absolute URLs (defaults to `https://prometheus.local`).
- `PRERENDER_MAX_WORKERS` – worker pool size for prerender (defaults to `1`; `bun run preview` uses CPU count unless overridden).
- `PRERENDER_WORKER_MULTIPLIER` – multiplier applied to the default worker count for preview/build scripts when `PRERENDER_MAX_WORKERS` is unset (defaults to `1.5`).
- `PRERENDER_MAX_TASKS_PER_WORKER` – parallel route tasks per worker (defaults to `5`).
- `SKIP_PRERENDER=1` – skip the prerender step (useful for faster local `bun run preview` when you don't need static HTML).

## Resumability + hydration guidance

- Default to SSR-only rendering for above-the-fold UI; avoid shipping client JS unless a user can interact.
- Use `on:qvisible` or similar lazy boundaries to wake islands only when they scroll into view.
- Split heavier widgets (store grid, chat socket UI, AI form) into separate files so Qwik can stream HTML while deferring their chunks.
- Scope CSS per route with `useStylesScoped$`/`routeStyles$` to keep the critical stylesheet tiny.
- Opt into client hydration only when an action or realtime connection is required; keep hero/summary content static.

## Third-party scripts

- Script sources live in `src/config/third-party.ts` with explicit budgets, load strategies, and Partytown forwarding targets.
- Analytics/ads default to Partytown (`type="text/partytown"`) while widgets load after interaction/idle when they cannot be offloaded.
- Run `bun run --cwd apps/web check:scripts` (bundled into `bun run lint`) to enforce:
  - Size ceilings (150kb max per vendor entry) with documented `budgetKb` values.
  - Async/defer or worker-based loading—no blocking tags.
  - Fallback/delay notes for interaction-gated widgets.
- Add new vendors by updating the config, supplying a budget, load timing (`defer`/`idle`/`interaction`), and any `forward`ed APIs for Partytown, then re-run the budget check.
