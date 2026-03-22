# Reusable Showcase Template

This repo ships as a Bun-powered template for a Qwik site, a Rust axum + WebTransport runtime, SpaceTimeDB, Garnet, and the fragment streaming shell that ties them together. The repo surface is intentionally split into a primary template path and a secondary `extras/` area so the default starter stays easier to scan.

The combined runtime entrypoint lives in `packages/platform-rs/src/main.rs`.

The template keeps two presets:

- `full`: the default showcase preset.
- `core`: the lean starter preset.

Preset and bundle metadata are generated into [docs/template-reference.md](/Users/colli/Documents/Project/prometheus-site/docs/template-reference.md). Maintainer workflow and bundle rules live in [docs/template-maintainer-guide.md](/Users/colli/Documents/Project/prometheus-site/docs/template-maintainer-guide.md).

## Quickstart

```bash
bun install
cp .env.full.example .env
bun run dev
```

Use `.env.core.example` instead if you want the lean preset from the start.

## Root Commands

```bash
bun run dev
bun run dev:core
bun run build
bun run build:core
bun run preview
bun run typecheck
bun run typecheck:core
bun run test
bun run test:core
bun run template:init -- --site-name "Acme" --product-name "Acme Platform" --package-scope @acme --project-name acme-site --web-host acme.dev --web-host-prod acme.prod --db-host db.acme.dev --db-host-prod db.acme.prod --compose-project-name acme --spacetime-module acme-site-local --auth-client-id acme-site-dev --native-bundle-id com.acme.site --notification-email notifications@acme.dev
bun run template:sync
bun run check:template
```

Browser smoke tests remain available after the containers are running:

```bash
bun run test:browser:full
bun run test:browser:core
```

## Generated Files

Do not hand-edit these files for lasting template changes. Update `@prometheus/template-config` and rerun `bun run template:sync`.

- [docs/template-reference.md](/Users/colli/Documents/Project/prometheus-site/docs/template-reference.md)
- [apps/site/public/manifest.webmanifest](/Users/colli/Documents/Project/prometheus-site/apps/site/public/manifest.webmanifest)
- [.env.example](/Users/colli/Documents/Project/prometheus-site/.env.example)
- [.env.full.example](/Users/colli/Documents/Project/prometheus-site/.env.full.example)
- [.env.core.example](/Users/colli/Documents/Project/prometheus-site/.env.core.example)

Generated build outputs must stay untracked:

- `apps/site/public/fragments/`
- `apps/site/src/fragment/fragment-css.generated.ts`
- `infra/caddy/Caddyfile`
- `apps/site/dist/`
- `apps/site/server/`
- `apps/site/storybook-static/`
- `apps/site/android/`
- `extras/spacetimedb-module/target/`
