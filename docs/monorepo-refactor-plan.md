# Monorepo refactor blueprint

This document captures the target state for restructuring the repository into a template-ready monorepo with clean boundaries, optional features, and a replaceable design system. It translates the requested plan into a concise, file-scoped checklist.

## Goals

- Hard separation between the core fragment engine, platform/runtime glue, design system, feature modules, and the site composition layer.
- Keep the core binary fragment pipeline zero-hydration by default and free of app-specific content.
- Make features add/removeable without touching core or other features.
- Centralize environment/infra concerns in a platform layer.
- Allow a site instance to provide branding, navigation, and content without embedding business logic.

## Target directory layout

```
packages/
  core/        # Fragment engine, routing/streaming, binary codecs, plan cache, generic i18n hooks
  platform/    # Env/config resolution, logging, cache + DB clients, Bun/Elysia server bootstrapping
  ui/          # Design system: global styles and presentational components
  features/    # Optional modules (auth, store, messaging, lab, etc.)
apps/
  site/        # Thin composition layer selecting features, branding, navigation, and copy
  webtransport/# Existing Go HTTP/3 adapter (unchanged)
infra/         # Infra configs (Docker, Caddy, etc.)
scripts/       # Tooling scripts
```

## Package-by-package moves and changes

### packages/core

- **Fragment types/codec:** Merge fragment types and binary encode/decode into `src/fragment/types.ts` and `src/fragment/binary.ts` (from `apps/web/src/fragment/types.ts`, `apps/api/src/fragments/types.ts`, and binary helpers).
- **Planner:** Move `apps/api/src/fragments/planner.ts` to `src/fragment/planner.ts`; remove hard-coded homepage fragments and let external plan maps supply entries. Core only handles dependency resolution/sorting.
- **Definitions:** Strip app-specific fragment definitions; provide stubs or registration hooks so the site (or a feature) injects actual fragment renderers.
- **Service/store:** Move generic fragment read/plan fetch/cache logic (`service.ts`, `store.ts`) and make cache access pluggable (no direct Valkey/DB calls). Keep in-memory memoization/locking.
- **Client orchestration:** Move client fragment orchestration (`apps/web/src/fragment/client.ts`, `plan-cache.ts`) under `src/client/`, parameterizing API/WebTransport bases and feature flags instead of reading env directly.
- **Server handlers:** Provide framework-agnostic handlers (e.g., `getFragmentPlanResponse`, `getFragmentPayloadResponse`) under `src/server/` and optional router factory sugar.
- **i18n:** Keep only language normalization + translator helpers in `src/i18n/`; move actual copy/phrases out of core.
- **Utilities:** Host speculation/prefetch utilities in `src/util/`, keeping them flag-driven but env-agnostic.

### packages/platform

- **Env/config:** Centralize env + feature flags (`src/env.ts`, `src/runtime-flags.ts`), exposing a config object for core/features instead of direct `import.meta.env` reads.
- **Logging/telemetry:** Move error reporting hooks and any analytics beacons here.
- **Cache/DB:** Wrap Valkey/Redis and Drizzle setup (`src/cache.ts`, `src/db.ts`), including connection lifecycle and optional pub/sub helpers.
- **Server bootstrap:** Rehome Bun/Elysia server startup, migrations, rate limits, and WebSocket/webtransport toggles into `src/server/bun.ts` (or similar), composing routes from core + features.
- **Framework adapters:** Provide Elysia wrappers for fragment/auth/store/chat routes as thin shims over core/feature logic.

### packages/ui

- **Styles:** Move global CSS (Tailwind + Lightning CSS) to `src/global.css`; site imports via `useStyles$`.
- **Components:** Move presentational components: Dock (+ DockIcon), FragmentCard, StaticRouteTemplate, LanguageToggle, ThemeToggle, RouteMotion, and theme store utilities. Keep them data-agnostic; accept props for labels/nav items instead of hard-coding.
- **Copy:** No baked-in site copy; components read labels from provided context/props to stay themeable.

### packages/features

- **Auth:** Move Better Auth integration (server routes + helpers) and the login page into `features/auth/`. Expose `validateSession` (public API) for other features.
- **Store:** Move store API (`/store/items`), cache key helpers, DB queries, cache invalidation, and optional realtime hooks into `features/store/`, plus the Store page UI.
- **Messaging:** Move chat history + AI echo routes, prompt validation, WS registration, chat cache invalidation, and any pub/sub bridging into `features/messaging/`.
- **Lab:** Move the Lab static page and any experimental/demo hooks into `features/lab/`.
- **Home/demo fragments:** Keep homepage fragment definitions/plan outside core (either as a feature or injected by the site). Provide translations alongside those definitions.

### apps/site

- **Root/layout:** Keep Qwik root and layout as a composition layer only; import providers/components from packages. Route files should re-export feature pages (login, store, lab) and keep the homepage fragment loader wiring.
- **Branding/navigation:** Define site branding, nav items, supported languages, and copy here. Pass copy data into the language provider instead of hard-coding inside components.
- **Homepage fragments:** Register fragment definitions and path plans for `/` (or other pages) from site config/feature, not from core.

## Performance and correctness guardrails

- Preserve zero-hydration fragment streaming by default; client extras (prefetch, analytics) remain flag-gated.
- Keep fragment caching behavior (etag-aware plan cache + fragment cache); Platform provides the concrete cache client.
- Maintain rate-limit and payload-limit enforcement via Platform utilities.
- Enforce import boundaries with lint/path-alias rules (core has no deps on platform/ui/features; site carries no feature logic).

## Migration checklist

1. Create packages (`core`, `platform`, `ui`, `features/...`) and move files per sections above, updating imports to scoped path aliases.
2. Introduce registration/injection points for fragment definitions, plan overrides, cache adapters, and copy/i18n data.
3. Update site routes/layout to consume UI + core providers and to define branding/nav/copy locally.
4. Relocate env/flag resolution to Platform and thread config into core/client/server entry points.
5. Preserve existing behaviors (streaming, caching, rate limits, WebTransport toggles) while removing app-specific content from core.
6. Add lint/TS config to prevent cross-boundary imports and document how to add/remove features or swap the design system.
