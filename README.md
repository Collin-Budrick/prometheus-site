# Reusable Showcase Template

This repo ships as a Bun-powered template for a Qwik site, a Rust axum + WebTransport runtime, SpaceTimeDB, Garnet, and the fragment streaming shell that ties them together. The repo surface is intentionally split into a primary template path and a secondary `extras/` area so the default starter stays easier to scan.

The combined runtime entrypoint lives in `packages/platform-rs/src/main.rs`.

The template ships with six presets:

- `full`: the default showcase preset.
- `core`: the lean starter preset.
- `marketing`: site-only starter for marketing pages.
- `saas`: auth/account starter with analytics and PWA hooks.
- `commerce`: store/account starter with installability.
- `community`: messaging-first starter with realtime support.

Preset and bundle metadata are generated into [docs/template-reference.md](/Users/colli/Documents/Project/prometheus-site/docs/template-reference.md). Preset selection guidance lives in [docs/template-preset-guide.md](/Users/colli/Documents/Project/prometheus-site/docs/template-preset-guide.md), bundle ownership rules live in [docs/template-bundle-cookbook.md](/Users/colli/Documents/Project/prometheus-site/docs/template-bundle-cookbook.md), and the generated docs site lives at [docs/template-site/index.html](/Users/colli/Documents/Project/prometheus-site/docs/template-site/index.html).

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
bun run desktop:dev
bun run desktop:run
bun run desktop:build
bun run desktop:build:canary
bun run desktop:build:stable
bun run build
bun run build:core
bun run preview
bun run typecheck
bun run typecheck:core
bun run desktop:typecheck
bun run test
bun run test:core
bun run template:new
bun run template:init -- --site-name "Acme" --product-name "Acme Platform" --package-scope @acme --project-name acme-site --web-host acme.dev --web-host-prod acme.prod --db-host db.acme.dev --db-host-prod db.acme.prod --compose-project-name acme --spacetime-module acme-site-local --auth-client-id acme-site-dev --native-bundle-id com.acme.site --notification-email notifications@acme.dev
bun run template:sync
bun run template:doctor
bun run template:diff
bun run template:report
bun run template:upgrade
bun run template:create-feature -- --feature-id customer-portal --title "Customer Portal" --route customer-portal
bun run check:template
```

Browser smoke tests remain available after the containers are running:

```bash
bun run test:browser:full
bun run test:browser:core
```

## Desktop Target

`apps/desktop` packages the existing HTTPS deployment as an Electrobun desktop shell. It does not start a local API stack; it loads the same site and Rust API/WebTransport endpoints you already run behind Caddy.

- `bun run desktop:dev` builds a watch-mode shell that targets `https://prometheus.dev` by default.
- `bun run desktop:build` creates a dev-channel build.
- `bun run desktop:build:canary` and `bun run desktop:build:stable` default to `https://prometheus.prod`.
- `PROMETHEUS_DESKTOP_TARGET_URL` overrides the remote URL for any run, and `PROMETHEUS_DESKTOP_TARGET_URL_DEV`, `PROMETHEUS_DESKTOP_TARGET_URL_CANARY`, and `PROMETHEUS_DESKTOP_TARGET_URL_STABLE` let you pin per-channel targets at build time.

## Generated Files

Do not hand-edit these files for lasting template changes. Update `@prometheus/template-config` and rerun `bun run template:sync`.

- [docs/template-reference.md](/Users/colli/Documents/Project/prometheus-site/docs/template-reference.md)
- [docs/template-preset-guide.md](/Users/colli/Documents/Project/prometheus-site/docs/template-preset-guide.md)
- [docs/template-bundle-cookbook.md](/Users/colli/Documents/Project/prometheus-site/docs/template-bundle-cookbook.md)
- [docs/template-site/index.html](/Users/colli/Documents/Project/prometheus-site/docs/template-site/index.html)
- [apps/site/public/manifest.webmanifest](/Users/colli/Documents/Project/prometheus-site/apps/site/public/manifest.webmanifest)
- [.env.example](/Users/colli/Documents/Project/prometheus-site/.env.example)
- [.env.full.example](/Users/colli/Documents/Project/prometheus-site/.env.full.example)
- [.env.core.example](/Users/colli/Documents/Project/prometheus-site/.env.core.example)
- [.env.marketing.example](/Users/colli/Documents/Project/prometheus-site/.env.marketing.example)
- [.env.saas.example](/Users/colli/Documents/Project/prometheus-site/.env.saas.example)
- [.env.commerce.example](/Users/colli/Documents/Project/prometheus-site/.env.commerce.example)
- [.env.community.example](/Users/colli/Documents/Project/prometheus-site/.env.community.example)

Generated build outputs must stay untracked:

- `apps/site/public/fragments/`
- `apps/site/src/fragment/fragment-css.generated.ts`
- `infra/caddy/Caddyfile`
- `apps/site/dist/`
- `apps/site/server/`
- `apps/site/storybook-static/`
- `apps/desktop/build/`
- `apps/desktop/artifacts/`
- `apps/site/android/`
- `extras/spacetimedb-module/target/`
