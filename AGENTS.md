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

## Testing and performance guardrails

- Run `bun run lint` and `bun run test` before committing.
- Keep Lighthouse budgets in mind: avoid increasing TBT/INP by shipping large client bundles.
- Add or update tests when changing behavior.

## PR instructions

- Use concise titles; include the relevant package/scope if applicable.
- Describe performance-sensitive changes explicitly (e.g., chunk splits, lazy-loading, third-party isolation).
