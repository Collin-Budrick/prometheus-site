# Web (Qwik City)

Qwik City SSR app with UnoCSS, Lightning CSS, view transitions, speculation rules, and optional Partytown for third-party isolation.

## Scripts

- `bun run dev` – start SSR dev server with hot module reloading.
- `bun run build` – build client + SSR output with Lightning CSS minification.
- `bun run preview` – preview the SSR build.
- `bun run lint` – run Oxlint linting.
- `bun run format` – apply Oxfmt formatting.
- `bun run test` – execute Qwik tests.

## Perf notes

- Home route ships minimal HTML/CSS with immutable caching headers.
- Speculation Rules prerender `/store` and prefetch `/chat` when supported.
- View Transitions enable smooth navigation without extra JS runtimes.
- Chat/WebSocket and AI logic only load on their respective routes.
- Partytown runs third-party tags off the main thread when `VITE_ENABLE_PARTYTOWN=true` (defaults on in prod). Worker assets are copied into `/public/~partytown/` during build via the Partytown Vite plugin.

## Styling conventions

- UnoCSS powers all on-demand utilities. Prefer utilities/shortcuts over ad-hoc global CSS; the `light:` variant targets `.light`
  or `[data-theme="light"]` while the built-in `dark:` variant still scopes to `.dark`.
- Keep global styles microscopic (reset + tokens only). Route-only animations/layout tweaks should live next to the route with
  `useStylesScoped$`/`routeStyles$` for critical extraction.
- Lightning CSS handles transforms/minification; run `bun run check:css` to fail fast if `src/global.css` exceeds the budget
  before builds and CI linting.

## Configuration

- `VITE_SPECULATION_RULES` – enable Speculation Rules prefetch/prerender hints for likely next routes (defaults on in prod, off in
  dev to avoid interfering with HMR).
- `VITE_ROUTE_VIEW_TRANSITIONS` – wrap route switches with the native View Transitions API when supported (defaults on in prod,
  off in dev).

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
