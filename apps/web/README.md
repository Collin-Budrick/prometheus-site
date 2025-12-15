# Web (Qwik City)

Qwik City SSR app with UnoCSS, Lightning CSS, view transitions, speculation rules, and optional Partytown for third-party isolation.

## Scripts
- `pnpm dev` – start SSR dev server with hot module reloading.
- `pnpm build` – build client + SSR output with Lightning CSS minification.
- `pnpm preview` – preview the SSR build.
- `pnpm lint` – run Biome linting.
- `pnpm format` – apply Biome formatting.
- `pnpm test` – execute Qwik tests.

## Perf notes
- Home route ships minimal HTML/CSS with immutable caching headers.
- Speculation Rules prerender `/store` and prefetch `/chat` when supported.
- View Transitions enable smooth navigation without extra JS runtimes.
- Chat/WebSocket and AI logic only load on their respective routes.
- Partytown can be enabled by setting `ENABLE_PARTYTOWN=true` and adding worker scripts to `/public/~partytown/`.
