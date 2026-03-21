# Template Guide

This repo now ships as a reusable showcase template. The default branch is meant to stay usable as a polished demo, while `full` and `core` presets let you strip the runtime down without deleting reusable routes, stories, or fragments.

## Start Here

1. Pick a preset.
   `full` keeps the whole showcase. `core` keeps the lean shell with auth, account, and starter-safe home demos.
2. Initialize branding.
   Run `bun run template:init --dry-run` first, then rerun it with your project name, package scope, hosts, module id, auth client id, and bundle id.
3. Sync generated template files.
   Run `bun run template:sync` after any manifest or branding change.
4. Validate the template surface.
   Run `bun run check:template`, then the preset-specific build, typecheck, and test scripts you intend to ship.

## Template Control Plane

- `packages/template-config/src/index.ts`
  Owns branding defaults, preset descriptors, bundle manifests, starter data ownership, story ownership, test ownership, static-shell ownership, and API registration metadata.
- `docs/template-reference.md`
  Generated from the manifest. Use this as the authoritative list of presets, bundles, env keys, generated artifacts, and starter data.
- `scripts/template-init.ts`
  Rewrites branding defaults across the repo in one pass.
- `scripts/template-sync.ts`
  Regenerates env examples, the web manifest, and the template reference doc from the shared config.

## Presets

- `full`
  Default showcase preset. Enables the complete reusable surface, including store, lab, messaging, realtime, PWA, analytics, and the optional demo bundles.
- `core`
  Lean starter preset. Keeps the shell, auth/account routes, and the starter home composition without the broader showcase surface.

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

Use `bun run template:init` to rewrite the defaults repo-wide, then commit the generated follow-up changes from `bun run template:sync`.

## Bundle Workflow

Each detachable feature belongs to a `FeatureBundleManifest`. A bundle owns:

- routes and route guards
- dock/topbar navigation
- env keys
- compose profiles
- Storybook story globs
- test globs
- static-shell entrypoints
- API registrations
- demo section ids
- starter data keys
- dependency, visibility, and placement metadata

Route files stay in place, but optional routes must gate themselves with the shared feature helpers so disabled bundles disappear cleanly and return `404`.

## Demo And Starter Data

Home demo copy now lives in `apps/site/src/template-demos.ts`. Starter-safe sample data lives in `apps/site/src/template-starter-data.ts`. Keep reusable demos here so new forks can edit content without modifying the underlying route or fragment plumbing.

Use the `starter` home mode when you want the shell plus a small number of safe demos without the full showcase composition.

## Infra Defaults

- The `realtime` compose profile belongs to the `realtime` bundle.
- `bun run dev` defaults to the `full` preset.
- `bun run dev:core` gives you the lean runtime without removing reusable files.
- `bun run preview`, `bun run build`, `bun run typecheck`, and `bun run test` all have preset-specific wrappers at the repo root.

## Required Checks

- `bun run check:template`
- `bun run build:full`
- `bun run build:core`
- `bun run typecheck:full`
- `bun run typecheck:core`
- `bun run test:full`
- `bun run test:core`
- `bun run test:browser:full`
- `bun run test:browser:core`

When a change affects the running site, rebuild and restart the containers before testing `https://prometheus.prod/`.

## Related Docs

- `docs/template-reference.md` for generated preset and bundle metadata
- `docs/add-a-bundle.md` for the bundle contract
