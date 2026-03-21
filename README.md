# Reusable Showcase Template

This repo is a Bun monorepo template for a Qwik site, a Bun + Elysia API, SpaceTimeDB, Garnet, Storybook, and the fragment rendering pipeline that powers the showcase home route.

The template ships with two presets:

- `full`: the default showcase branch with store, lab, messaging, realtime, PWA, analytics, and all home demos enabled.
- `core`: a lean starter with auth, account, and the lighter `starter` home composition.

Generated preset and bundle metadata lives in [docs/template-reference.md](/Users/colli/Documents/Project/prometheus-site/docs/template-reference.md).

## Quickstart

```bash
bun install
copy .env.full.example .env
bun run dev
```

Use `.env.core.example` instead when you want the lean preset from the start.

## Template Workflow

1. Choose a preset: `full` or `core`.
2. Initialize branding and ids in one pass.
3. Start the local stack.
4. Enable or disable bundles as needed.
5. Re-sync the template-managed docs, env examples, and manifest after config changes.

Useful commands:

```bash
bun run template:init -- --site-name "Acme" --product-name "Acme Platform" --package-scope @acme --project-name acme-site --web-host acme.dev --web-host-prod acme.prod --db-host db.acme.dev --db-host-prod db.acme.prod --compose-project-name acme --spacetime-module acme-site-local --auth-client-id acme-site-dev --native-bundle-id com.acme.site --notification-email notifications@acme.dev
bun run template:sync
bun run check:template
bun run dev
bun run dev:core
```

## Preset Scripts

```bash
bun run build:full
bun run build:core
bun run typecheck:full
bun run typecheck:core
bun run test:full
bun run test:core
```

Browser smoke tests are available once the containers are up:

```bash
bun run test:browser:full
bun run test:browser:core
```

## Generated Surfaces

Do not hand-edit these files for persistent template changes; update `@prometheus/template-config` and run `bun run template:sync` instead.

- [docs/template-reference.md](/Users/colli/Documents/Project/prometheus-site/docs/template-reference.md)
- [apps/site/public/manifest.webmanifest](/Users/colli/Documents/Project/prometheus-site/apps/site/public/manifest.webmanifest)
- [.env.example](/Users/colli/Documents/Project/prometheus-site/.env.example)
- [.env.full.example](/Users/colli/Documents/Project/prometheus-site/.env.full.example)
- [.env.core.example](/Users/colli/Documents/Project/prometheus-site/.env.core.example)

Generated build artifacts must stay untracked:

- `apps/site/public/fragments/`
- `apps/site/src/fragment/fragment-css.generated.ts`
- `infra/caddy/Caddyfile`
- `apps/site/dist/`
- `apps/site/server/`
- `apps/site/storybook-static/`
- `apps/site/android/`
- `packages/spacetimedb-module/target/`

## More Docs

- [Template Reference](/Users/colli/Documents/Project/prometheus-site/docs/template-reference.md)
- [Template Guide](/Users/colli/Documents/Project/prometheus-site/docs/monorepo-refactor-plan.md)
- [Add A Bundle](/Users/colli/Documents/Project/prometheus-site/docs/add-a-bundle.md)
