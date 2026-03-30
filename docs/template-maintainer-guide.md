# Template Maintainer Guide

This repo ships as a reusable showcase template. Keep `full` as the default shipped preset, keep `core` as the lean starter preset, and preserve the template workflow driven by `packages/template-config/src/index.ts`.

## Template Surface

- Primary template paths: `apps/site`, `packages/{core,platform,platform-rs,ui,template-config,spacetimedb-client}`, `scripts`, `infra`, `tests`, `docs`
- Secondary paths: `extras/spacetimedb-module`
- Combined runtime entrypoint: `packages/platform-rs/src/main.rs`
- Site feature UI belongs under `apps/site/src/features`
- Platform feature server code belongs under `packages/platform-rs/src`
- Shared site utilities stay in `apps/site/src/shared` only when they are genuinely cross-route

## Control Plane

- `packages/template-config/src/index.ts`
  Owns branding defaults, preset descriptors, bundle manifests, starter data ownership, story ownership, test ownership, static shell ownership, and API registration metadata.
- `docs/template-reference.md`
  Generated from the manifest. Use it as the source of truth for presets, bundles, env keys, generated artifacts, and starter data.
- `scripts/template.ts`
  Dispatches the template-facing `init`, `sync`, and `check` commands from one entrypoint.
- `scripts/template-init.ts` and `scripts/template-sync.ts`
  Keep the concrete implementation for the rewrite and regeneration passes behind the template dispatcher.

## Presets

- `full`
  Default showcase preset. Enables store, lab, messaging, realtime, PWA, analytics, and the full home showcase surface.
- `core`
  Lean starter preset. Keeps auth, account, and the lighter starter home composition.

Preset selection is controlled by `PROMETHEUS_TEMPLATE_PRESET`, `TEMPLATE_PRESET`, or `VITE_TEMPLATE_PRESET`. Feature-level overrides use the matching `*_TEMPLATE_FEATURES` and `*_TEMPLATE_DISABLE_FEATURES` env vars.

## Branding Workflow

`templateBranding` is the single source of truth for:

- project and package names
- compose project name
- default web and database hosts
- SpaceTimeDB module ids
- auth client ids
- manifest ids
- cache prefixes
- notification copy and contact email

Use `bun run template:init` to rewrite defaults repo-wide, then commit the generated follow-up changes from `bun run template:sync`.

## Auth Providers

Better Auth social providers remain mounted at `/api/auth/callback/<provider>` unless `AUTH_BASE_PATH` changes.

- Google callback URLs: `https://prometheus.dev/api/auth/callback/google` and `https://prometheus.prod/api/auth/callback/google`
- Facebook callback URLs: `https://prometheus.dev/api/auth/callback/facebook` and `https://prometheus.prod/api/auth/callback/facebook`
- X callback URLs: `https://prometheus.dev/api/auth/callback/twitter` and `https://prometheus.prod/api/auth/callback/twitter`
- Better Auth uses the provider id `twitter` for X
- The X app must request the `user.email` scope so the hosted flow can recover the email address

## Bundle Contract

Each detachable feature belongs to a `FeatureBundleManifest`. A bundle owns:

- routes and route guards
- navigation entries
- env keys
- compose profiles
- Storybook story globs
- test globs
- static shell entrypoints
- API registrations
- demo section ids
- starter data keys
- dependency, visibility, and placement metadata

Optional behavior must stay manifest-driven. If a bundle is disabled, its nav links must disappear, owned routes must return `404`, and bundle-owned runtime hooks must stay inactive.

## Demo And Starter Data

- Reusable home/demo metadata belongs in `packages/template-config/src/index.ts`
- Starter-safe sample data belongs in `packages/template-config/src/index.ts`
- Keep copy and seed content editable without forcing forks to edit route or fragment plumbing

Use the `starter` home mode when you want the shell plus a small number of safe demos without the full showcase composition.

## PWA And Service Worker

The site uses Serwist via `@serwist/vite` to build the service worker from `apps/site/src/service-worker.ts` and emit `/service-worker.js` during the Vite build. The web manifest lives at `apps/site/public/manifest.webmanifest`, and the Serwist precache list is extended with the shell and icon assets.

Keep service worker behavior isolated from SSR and preview-only flows. PWA behavior should only activate when the `pwa` bundle is enabled.

## Highlight Builds

Highlight stays disabled unless the build sets both `VITE_ENABLE_HIGHLIGHT=1` and `VITE_HIGHLIGHT_PROJECT_ID`.

Optional tuning envs:

- `VITE_HIGHLIGHT_SAMPLE_RATE=0.1`
- `VITE_HIGHLIGHT_PRIVACY=strict`
- `VITE_HIGHLIGHT_SESSION_RECORDING=1`
- `VITE_HIGHLIGHT_CANVAS_SAMPLING=2`

Example Bun build:

```sh
VITE_ENABLE_HIGHLIGHT=1 VITE_HIGHLIGHT_PROJECT_ID=your-project-id bun run --cwd apps/site build
```

Example Docker build:

```sh
docker build -f apps/site/Dockerfile \
  --build-arg VITE_ENABLE_HIGHLIGHT=1 \
  --build-arg VITE_HIGHLIGHT_PROJECT_ID=your-project-id \
  --build-arg VITE_HIGHLIGHT_SAMPLE_RATE=0.1 \
  -t prometheus-site .
```

## Root Commands

Keep the repo root limited to user-facing template commands:

- `bun run dev`
- `bun run dev:core`
- `bun run build`
- `bun run build:core`
- `bun run typecheck`
- `bun run typecheck:core`
- `bun run test`
- `bun run test:core`
- `bun run template:init`
- `bun run template:sync`
- `bun run check:template`
- `bun run test:browser:full`
- `bun run test:browser:core`

Move low-level or operator-only commands into workspace package scripts or `_internal:*` root scripts.

## Required Checks

- `bun run template:sync`
- `bun run check:template`
- `bun run build`
- `bun run build:core`
- `bun run typecheck`
- `bun run typecheck:core`
- `bun run test`
- `bun run test:core`
- `bun run test:browser:full`
- `bun run test:browser:core`

When a change affects the running site, rebuild and restart the containers before testing `https://prometheus.prod/`.
