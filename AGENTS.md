# AGENTS.md

## How to use this file

- Read this doc before making changes; treat it as the project’s guardrails.
- Follow the sections that match your task (routing, SSR/SSG, styling, animation, i18n).
- If a request conflicts with these rules, pause and ask for clarification.
- When adding new patterns or workflows, update this file so future work stays consistent.
- Keep additions concise and scoped; prefer small, explicit rules over broad principles.
- Nested `AGENTS.md` files override parent scopes. When editing any file, search upward and downward for `AGENTS.md` within that path to catch more specific rules and re-read them before committing.

## Project ethos ("Insane Mode")

- HTML-first: ship SSR pages that work without JS; wake up interactivity only where users interact.
- Prefer Qwik + Qwik City SSR with resumability; use dynamic imports for non-critical routes/widgets.
- Keep the initial route microscopic: split chunks aggressively and ship only essential CSS/HTML.
- Navigation polish without bloat: use native View Transitions API and Speculation Rules as progressive enhancements.
- Main thread is sacred: relocate third-party scripts with Partytown and avoid heavy client runtimes.
- GPU/WebGPU (TypeGPU) and WebTransport are opt-in feature routes only; provide fallbacks (WebSockets, non-GPU UI).

## Setup commands

- Install dependencies: `bun install`
- Start dev server: `bun run dev`
- Run tests/checks: `bun run test`

## Build/tooling expectations

- Target Vite 8 Beta (Rolldown) for dev/build speed and fine-grained chunking.
- Prefer UnoCSS + Lightning CSS for minimal CSS output and fast transforms/minification.
- Optimize for HTTP/3 + Early Hints at the edge (preload only truly critical assets).
- PWA/Workbox config lives in `apps/web/vite.config.ts`; service worker registration is in `apps/web/src/entry.client.tsx`—update both for caching/offline changes.
- Env toggles live in `apps/web/src/config/env.ts`; update `.env.example` when adding new env vars.

## Code style and architecture

- Favor TypeScript strict mode; single quotes; avoid unnecessary semicolons.
- No hydration tax: components should be resumable/lazy-loaded; avoid global client bundles.
- Keep main-thread JS minimal; defer third-party scripts and move them off-thread via Partytown when needed.
- Animations: prefer CSS/View Transitions; avoid large JS animation runtimes.
- Progressive enhancement: feature-detect Speculation Rules, View Transitions, WebGPU, and WebTransport before use.
- Realtime: WebSockets as default path; WebTransport as optional fast-path.
- Data layer: prefer Postgres + Valkey as cache/pubsub.
- Never wrap imports in try/catch.
- Keep entry points stable; prefer route/component edits over `apps/web/src/entry.*` changes.

## Editing site pages (SSR + SSG guardrails)

Use these rules when touching routes, layouts, components, or styles.

- Common resumability hazards (avoid or fix with the noted remedy):
  - Capturing non-serializable values inside `$()` handlers—move DOM access into `useVisibleTask$` and keep `$()` pure.
  - Returning `Date`/`URL`/`Map`/`Set`/`BigInt` or class instances from loaders/actions—serialize to primitives before returning.
  - Accessing `window`/`document`/`matchMedia` during render—guard inside `useVisibleTask$`/`useTask$` and check `typeof document !== 'undefined'`.

### Route structure + where to edit

- Pages live in `apps/web/src/routes/[locale]/...` (localized routes).
- Shared layout and nav live in `apps/web/src/routes/[locale]/layout.tsx`.
- Global app shell lives in `apps/web/src/root.tsx`.
- Critical CSS is `apps/web/src/routes/critical.css` and is inlined directly from the locale layout via a raw import.
- Non-critical/global styles live in `apps/web/src/global.css` and UnoCSS output is `apps/web/public/assets/app.css` (generated).
- Shared components live in `apps/web/src/components/...`.
- Server-only helpers live under `apps/web/src/server/...` or route `server$` calls.
- Non-locale entry routes (e.g., `apps/web/src/routes/ai/index.tsx`) should wrap `[locale]` pages via `LocaleEntry` from `apps/web/src/routes/_shared/locale/entry.tsx` so locale detection stays consistent.

### Page config (central JSON)

- Per-route attributes live in `apps/web/src/config/page-config.json`.
- `render: "ssg"` adds a route to prerender + static caching; default comes from `defaults`.
- `speculation: "prefetch" | "prerender" | "none"` controls link hinting.
- Access config in code via `apps/web/src/config/page-config.ts` (`getPageConfig`, `getPageSpeculation`).
- `bun run build` runs `sync:page-config` to auto-add new folder-based `index.*` routes; dynamic segments or non-index route files still need manual entries.
- `getPageSpeculation` feeds the main nav in `apps/web/src/routes/[locale]/layout.tsx`; keep `page-config.json` and nav links aligned when adding top-level routes.

### SSG/SSR safety rules (must follow)

- Any function passed to `onClick$`, `onInput$`, `useTask$`, etc. must be a QRL (`$()`), not a plain function. Plain functions are not serializable and will crash SSG with Qwik `Code(3)`.
- Avoid capturing non-serializable values inside `$()` callbacks (e.g., `window`, `document`, `AbortController`, class instances, `Map`, `Set`, `Date`, `URL`, `RegExp`, `BigInt`, `Error`). Use them only inside `useVisibleTask$` or `useTask$` and construct them at runtime.
- Prefer `useVisibleTask$` for DOM/`window`/`document` interactions; guard with `typeof document !== 'undefined'`.
- Any data returned from `routeLoader$`, `routeAction$`, or `server$` must be JSON-serializable. Convert `BigInt`/`Date`/`Map`/`Set` into primitives before returning.
- Keep SSR execution pure: don’t access `window`, `document`, `localStorage`, or `matchMedia` in component render; only in `useVisibleTask$` or `useTask$` with guards.
- When adding new routes to be statically generated, update `apps/web/src/config/page-config.ts` and ensure `onStaticGenerate` includes the locale.

### Styling + critical path rules

- If the change affects the header/nav or above-the-fold UI, update `apps/web/src/routes/critical.css` so the layout is stable before `app.css` loads.
- Keep critical CSS minimal and structural: only what’s needed for initial layout and the current route (e.g., above-the-fold grid sizing in `critical.css`; color tweaks can live in `global.css`).
- Prefer utility classes for non-critical styling, but ensure critical structural styles exist in `critical.css`.
- Put shared/non-critical styles in `apps/web/src/global.css`; never edit the generated `apps/web/public/assets/app.css`.
- Prefer route-scoped styles (`useStylesScoped$`/`routeStyles$`) for route-only CSS so `global.css` stays tiny.

### Animation implementation (Motion One mini)

- Default to CSS/View Transitions; when JS is required, use `apps/web/src/components/animations/use-motion-mini.ts` to lazy-load Motion One safely. Checklist: prefer CSS first, wire DOM access inside `useVisibleTask$`, guard reduced motion, cancel in-flight animations, and avoid DOM access during SSR render.
- All DOM animation wiring belongs in `useVisibleTask$`; keep render/SSR pure.
- Use `const motion = useMotionMini()` inside the visible task and call:
  - `motion.prewarm({ element, willChange: 'opacity, transform, filter', delay: 0 })` to prefetch the chunk (respects Save-Data and reduced motion).
  - `motion.loadAnimate()` when actually animating.
  - `motion.prefersReducedMotion()` to skip animations.
- Qwik runtime priming is hover/interaction-based (no DOMContentLoaded warmup). To prewarm for first interaction, add `data-qwik-prime` to the trigger element; the lazy loader in `apps/web/src/entry.ssr.tsx` will prefetch on `pointerover` and on the first real input event.
- For animated `<details>` menus:
  - Add `animated-details` to the `<details>` and `animated-panel` to the panel.
  - Set `menu.dataset.js = 'true'` in the visible task so `critical.css` shows the panel only for no-JS fallback.
  - Add `data-qwik-prime` to the `<summary>` trigger if you want Qwik primed on hover.
  - Intercept the summary click to animate close: `event.preventDefault()`, run the close animation, then set `menu.open = false`.
  - Guard the `toggle` handler with a flag (e.g., `ignoreToggle`) so programmatic open/close doesn’t double-run animations.
  - Keep the panel visible during close (`panel.style.display = 'grid'`), run `panel.getBoundingClientRect()` before the animation, and remove inline styles after finish.
  - Cancel any in-flight animation before starting a new one and clear handles when complete; guard against reduced motion via `motion.prefersReducedMotion()`.
  - Example (animated-details pattern): handle `summary` clicks with `event.preventDefault()`, run the close animation, then set `menu.open = false` once finished while keeping the panel visible during the animation.

### SSR safety checklist

- Never touch `window`/`document`/`matchMedia`/`localStorage` during render; wrap browser-only logic in `useVisibleTask$` with guards.
- Keep loader/action/server$ data JSON-serializable; convert objects like `Date`/`Map`/`Set`/`URL` before returning.
- Ensure all event handlers passed to `$()` stay serializable and avoid capturing module-scoped singletons.
- Always cancel any in-flight animation before starting a new one and clear the animation handle when finished.

### Locale + navigation rules

- Use `locales`/`localeNames` from `compiled-i18n`.
- Locale-aware links should be built from `useLocation()` and preserve the non-locale path when swapping locales.
- When building locale switchers, derive the base path from `useLocation().url.pathname` (strip the leading locale segment) and rebuild links with the target locale plus the preserved remainder.
- For labels in UI, use `compiled-i18n` `_`` strings so they localize correctly.

### Adding a new language

- Add the locale code to `i18nPlugin` and `localeBuildFallback` in `apps/web/vite.config.ts`.
- Create `i18n/<locale>.json` by copying `i18n/en.json`; set `locale`, `name` (selector label), optional `fallback`, and translate all keys.
- Update locale loaders in `packages/i18n-locales/index.mjs` and `packages/i18n-locales/index.cjs`.
- Locale routes are served through the dynamic `apps/web/src/routes/[locale]` tree; add new locales there instead of creating alias folders (the former `en`/`ko` aliases have been removed).
- Restart `bun run dev` after changing `vite.config.ts` or adding locale JSON files.
- Optional: update locale-specific tests or `apps/web/src/config/page-config.ts` if you want localized prerender coverage.
- Checklist: update `apps/web/vite.config.ts` locale lists, add `i18n/<locale>.json`, extend `packages/i18n-locales/index.{mjs,cjs}`, ensure `[locale]` routes exist, and restart the dev server.

### Testing + preview expectations

- `bun run dev` for HMR; `bun run preview` runs the full build + prerender.
- Preview runs off build artifacts; after SSR/i18n changes, rerun `bun run preview` or delete `apps/web/dist` and `apps/web/server` to force a rebuild.
- If preview serves stale assets, delete `apps/web/dist` and `apps/web/server` and rerun.
- SSG failures typically mean non-serializable values in QRLs or loader data; fix by moving logic into `useVisibleTask$` or by serializing the data.

### Performance budgets

- Treat bundle size as a feature; prefer lazy loading/dynamic imports for heavy widgets and keep main-thread JS minimal.
- Track Lighthouse and Web Vitals (TBT/INP) when modifying routes; avoid regressions from added client runtime.

## Repository map (what lives where)

- `apps/web/` — Qwik City web app (this is where page work happens).
- `apps/web/src/routes/` — Route tree; `apps/web/src/routes/[locale]/` holds localized pages.
- `apps/web/src/routes/[locale]/layout.tsx` — Shared layout/header/nav and `<RouterHead />`.
- `apps/web/src/routes/[locale]/index.tsx` — Home page content.
- `apps/web/src/routes/[locale]/ai/` — AI route UI (`index.tsx`) and island logic.
- `apps/web/src/routes/[locale]/chat/` — Chat route UI and islands.
- `apps/web/src/routes/[locale]/store/` — Store route UI, data loaders, and islands.
- `apps/web/src/routes/index/`, `apps/web/src/routes/ai/`, `apps/web/src/routes/chat/`, `apps/web/src/routes/store/` — Locale entry wrappers for non-`[locale]` paths.
- `apps/web/src/config/page-config.ts` — SSG route list helper (`prerenderRoutes`).
- `apps/web/src/routes/critical.css` — Critical CSS (inlined on SSR/SSG from the locale layout).
- `apps/web/src/routes/layout.css` — Layout-level CSS for the shell.
- `apps/web/src/root.tsx` — App shell and providers.
- `apps/web/src/components/` — Reusable UI components (nav, locale selector, etc).
- `apps/web/src/components/animations/` — Motion One mini helpers (`use-motion-mini.ts`).
- `apps/web/src/config/` — Feature flags, env parsing, third-party config.
- `apps/web/src/config/page-config.json` — Central per-route settings (render/speculation).
- `apps/web/src/config/page-config.ts` — Helpers for reading page config.
- `apps/web/src/server/` — Server-only helpers (DB, API, adapters).
- `apps/web/src/i18n/` — Locale helpers and dictionaries.
- `apps/web/src/global.css` — Global styling (non-critical).
- `apps/web/public/` — Static assets served as-is.
- `apps/web/public/assets/app.css` — Generated global CSS (do not edit by hand).
- `apps/web/scripts/` — Build/dev/prerender/preview tooling.
- `apps/web/vite.config.ts` — Vite + Qwik City configuration.
- `apps/web/qwik.config.ts` — Re-exports Vite config for Qwik tooling.
- `apps/web/uno.config.ts` — UnoCSS config.
- `apps/web/tests/` — Unit + Playwright specs (smoke/a11y/perf/i18n).
- `apps/web/src/i18n/pathname-locale.test.ts` — Locale resolver unit test.
- `apps/web/dist/` — Client build output (generated).
- `apps/web/server/` — SSR build output (generated).
- `packages/i18n-*` — Shared i18n helper packages (data, locale registry, shared state).
- `i18n/` — Shared locale resources for the monorepo.
- `patches/` — Dependency patches (e.g., Qwik tweaks).
- `scripts/` — Repo-level scripts (outside `apps/web`).

## Testing and performance guardrails

- Run `bun run lint` and `bun run test` before committing.
- Build runs a lightweight i18n smoke test (`apps/web/tests/home-i18n.test.ts`) via the `prebuild` hook; keep home copy keys in sync across locales.
- CSS/script budgets are enforced by `apps/web/scripts/check-css-budget.ts` and `apps/web/scripts/check-script-budget.ts`; update `apps/web/src/global.css` and `apps/web/src/config/third-party.ts` when budgets or vendors change.
- Keep Lighthouse budgets in mind: avoid increasing TBT/INP by shipping large client bundles.
- Add or update tests when changing behavior.

## Third-party scripts and bundle discipline

- Defer or offload third-party scripts via Partytown; avoid main-thread impact and keep configuration under `apps/web/src/config/third-party.ts`.
- Aggressively code-split non-critical routes/widgets with dynamic imports to keep the initial route payload microscopic.
- Do not wrap imports in `try/catch`; rely on static resolution for determinism and tree-shaking.

## Data + realtime expectations

- Default to WebSockets for realtime; WebTransport is an optional fast-path with fallbacks.
- Keep progressive enhancement in mind when adding new transport options.
- Server-only helpers belong under `apps/web/src/server/` or route loader/action/server$ files; avoid mixing server logic into shared client components.
- Database change fan-out should be event-driven (no polling): use Postgres `LISTEN/NOTIFY` with a trigger that emits a minimal payload (table/op/id only) and keep payloads under the ~8KB NOTIFY limit.
- API listens via `pgClient.listen`, validates/normalizes with `drizzle-zod` + `zod`, and emits **semantic** events (e.g., `store:upsert`, `store:delete`) over WebSocket routes like `/api/store/ws`—never forward raw DB payloads.
- Clients update Qwik `Signal`s inside `useVisibleTask$` WebSocket handlers; mutate signal state directly and keep render/SSR pure.
- For store realtime specifically: channel `store_items_updates` + trigger `store_items_notify` in `apps/api/drizzle`, listener in `apps/api/src/server/store-realtime.ts`, broadcast from `apps/api/src/server/app.ts`, and UI signal updates in `apps/web/src/routes/[locale]/store/store-island.tsx`.

## Styling + tooling notes

- UnoCSS + Lightning CSS are the preferred pipeline. `apps/web/public/assets/app.css` is generated—never edit it directly; use `apps/web/src/global.css` for global styles.

## Speculation and navigation hints

- Configure link speculation in `apps/web/src/config/page-config.json` via the `speculation` field (`prefetch`, `prerender`, `none`). Enable `prerender` only for truly cacheable pages; use `prefetch` for likely navigations with light payloads; choose `none` when network budget or dynamic data make hints risky.

## PR instructions

- Use concise titles; include the relevant package/scope if applicable.
- Describe performance-sensitive changes explicitly (e.g., chunk splits, lazy-loading, third-party isolation).
