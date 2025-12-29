# Prometheus Site Monorepo

Performance-first monorepo running a Qwik City SSR web app and a Bun + Elysia API, wired together with Postgres and Valkey.

## Quick start

Most workflows live in [TEMPLATE.md](./TEMPLATE.md). Use it for setup, opt-in features, and the component checklist.

- Clone + install: `git clone <repo> && cd prometheus-site && bun install`
- Dev servers: `bun run dev` (web + api) or `make dev` for the docker-compose **dev** profile
- Preview: `bun run build` then `bun run preview`
- Quality: `bun run lint` and `bun run test`

## Repo map

- `apps/web` — Qwik City SSR with UnoCSS + Lightning CSS, Speculation Rules, and optional Partytown
- `apps/api` — Bun + Elysia REST/WebSocket service using Drizzle (Postgres) and Valkey
- `infra/` — Traefik dynamic config, Postgres init scripts, Valkey config
- `docker-compose.*` — Dev and prod profiles bundling web, api, db, valkey, and Traefik
- `scripts/` — Perf audit helpers and tooling wrappers

## Ports (defaults)

- Web: `4173`
- API: `4000`
- Postgres: `5433`
- Valkey: `6379`
- Traefik edge: `80` (HTTP), `443` (HTTPS + HTTP/3)

## Contributing

- Install: `bun install`
- Dev server: `bun run dev`
- Preview: `bun run build` then `bun run preview`
- Lint/tests: `bun run lint` and `bun run test`
- Git hooks (Lefthook): install with `bunx lefthook install`; set `LEFTHOOK=0` to bypass in CI if needed.
