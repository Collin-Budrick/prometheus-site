# AGENTS.md

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

## Code style and architecture

- Favor TypeScript strict mode; single quotes; avoid unnecessary semicolons.
- No hydration tax: components should be resumable/lazy-loaded; avoid global client bundles.
- Keep main-thread JS minimal; defer third-party scripts and move them off-thread via Partytown when needed.
- Animations: prefer CSS/View Transitions; avoid large JS animation runtimes.
- Progressive enhancement: feature-detect Speculation Rules, View Transitions, WebGPU, and WebTransport before use.
- Realtime: WebSockets as default path; WebTransport as optional fast-path.
- Data layer: prefer Postgres + Valkey as cache/pubsub.
- Never wrap imports in try/catch.

## Editing site pages (SSR + SSG guardrails)

Use these rules when touching routes, layouts, components, or styles.

### Route structure + where to edit

- Pages live in `apps/web/src/routes/[locale]/...` (localized routes).
- Shared layout and nav live in `apps/web/src/routes/[locale]/layout.tsx`.
- Global app shell lives in `apps/web/src/root.tsx`.
- Critical CSS is `apps/web/src/routes/critical.css` and is inlined via `apps/web/src/routes/critical-css-assets.ts`.
- Non-critical/global styles live in `apps/web/src/global.css` and UnoCSS output is `apps/web/public/assets/app.css` (generated).
- Shared components live in `apps/web/src/components/...`.
- Server-only helpers live under `apps/web/src/server/...` or route `server$` calls.

### SSG/SSR safety rules (must follow)

- Any function passed to `onClick$`, `onInput$`, `useTask$`, etc. must be a QRL (`$()`), not a plain function. Plain functions are not serializable and will crash SSG with Qwik `Code(3)`.
- Avoid capturing non-serializable values inside `$()` callbacks (e.g., `window`, `document`, `AbortController`, class instances, `Map`, `Set`, `Date`, `URL`, `RegExp`, `BigInt`, `Error`). Use them only inside `useVisibleTask$` or `useTask$` and construct them at runtime.
- Prefer `useVisibleTask$` for DOM/`window`/`document` interactions; guard with `typeof document !== 'undefined'`.
- Any data returned from `routeLoader$`, `routeAction$`, or `server$` must be JSON-serializable. Convert `BigInt`/`Date`/`Map`/`Set` into primitives before returning.
- Keep SSR execution pure: don’t access `window`, `document`, `localStorage`, or `matchMedia` in component render; only in `useVisibleTask$` or `useTask$` with guards.
- When adding new routes to be statically generated, update `apps/web/src/routes/prerender-routes.ts` and ensure `onStaticGenerate` includes the locale.

### Styling + critical path rules

- If the change affects the header/nav or above-the-fold UI, update `apps/web/src/routes/critical.css` so the layout is stable before `app.css` loads.
- Keep critical CSS minimal: only what’s needed for initial layout and the current route.
- Prefer utility classes for non-critical styling, but ensure critical structural styles exist in `critical.css`.

### Locale + navigation rules

- Use `locales`/`localeNames` from `compiled-i18n`.
- Locale-aware links should be built from `useLocation()` and preserve the non-locale path.
- For labels in UI, use `compiled-i18n` `_`` strings so they localize correctly.

### Adding a new language

- Add the locale code to `i18nPlugin` and `localeBuildFallback` in `apps/web/vite.config.ts`.
- Create `i18n/<locale>.json` by copying `i18n/en.json`; set `locale`, `name` (selector label), optional `fallback`, and translate all keys.
- Update locale loaders in `apps/i18n-locales/index.mjs` and `apps/i18n-locales/index.cjs`.
- If keeping explicit locale routes (see `apps/web/src/routes/en` and `apps/web/src/routes/ko`), copy one of those folders to `apps/web/src/routes/<locale>` and update `layout.tsx` to set the new locale.
- Restart `bun run dev` after changing `vite.config.ts` or adding locale JSON files.
- Optional: update locale-specific tests or `apps/web/src/routes/prerender-routes.ts` if you want localized prerender coverage.

### Testing + preview expectations

- `bun run dev` for HMR; `bun run preview` runs the full build + prerender.
- Preview runs off build artifacts; after SSR/i18n changes, rerun `bun run preview` or delete `apps/web/dist` and `apps/web/server` to force a rebuild.
- If preview serves stale assets, delete `apps/web/dist` and `apps/web/server` and rerun.
- SSG failures typically mean non-serializable values in QRLs or loader data; fix by moving logic into `useVisibleTask$` or by serializing the data.

## Repository map (what lives where)

- `apps/web/` — Qwik City web app (this is where page work happens).
- `apps/web/src/routes/` — Route tree; `apps/web/src/routes/[locale]/` holds localized pages.
- `apps/web/src/routes/[locale]/layout.tsx` — Shared layout/header/nav and `<RouterHead />`.
- `apps/web/src/routes/[locale]/index.tsx` — Home page content.
- `apps/web/src/routes/[locale]/ai/` — AI route UI (`index.tsx`) and island logic.
- `apps/web/src/routes/[locale]/chat/` — Chat route UI and islands.
- `apps/web/src/routes/[locale]/store/` — Store route UI, data loaders, and islands.
- `apps/web/src/routes/prerender-routes.ts` — SSG route list (must include any new static route).
- `apps/web/src/routes/critical.css` — Critical CSS (inlined on SSR/SSG).
- `apps/web/src/routes/critical-css-assets.ts` — Loads critical CSS for inlining.
- `apps/web/src/routes/layout.css` — Layout-level CSS for the shell.
- `apps/web/src/root.tsx` — App shell and providers.
- `apps/web/src/components/` — Reusable UI components (nav, locale selector, etc).
- `apps/web/src/config/` — Feature flags, env parsing, third-party config.
- `apps/web/src/server/` — Server-only helpers (DB, API, adapters).
- `apps/web/src/i18n/` — Locale helpers and dictionaries.
- `apps/web/src/global.css` — Global styling (non-critical).
- `apps/web/public/` — Static assets served as-is.
- `apps/web/public/assets/app.css` — Generated global CSS (do not edit by hand).
- `apps/web/scripts/` — Build/dev/prerender/preview tooling.
- `apps/web/vite.config.ts` — Vite + Qwik City configuration.
- `apps/web/qwik.config.ts` — Re-exports Vite config for Qwik tooling.
- `apps/web/uno.config.ts` — UnoCSS config.
- `apps/web/tests/` — E2E tests.
- `apps/web/src/routes/*.test.ts` — Route-level unit tests.
- `apps/web/dist/` — Client build output (generated).
- `apps/web/server/` — SSR build output (generated).
- `i18n/` — Shared locale resources for the monorepo.
- `patches/` — Dependency patches (e.g., Qwik tweaks).
- `scripts/` — Repo-level scripts (outside `apps/web`).

## Testing and performance guardrails

- Run `bun run lint` and `bun run test` before committing.
- Keep Lighthouse budgets in mind: avoid increasing TBT/INP by shipping large client bundles.
- Add or update tests when changing behavior.

## PR instructions

- Use concise titles; include the relevant package/scope if applicable.
- Describe performance-sensitive changes explicitly (e.g., chunk splits, lazy-loading, third-party isolation).
