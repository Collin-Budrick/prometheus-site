This directory only wires the API to the shared fragment engine in `packages/core`.

- Binary codecs, planner types, and tree helpers now live under `@core/fragments`.
- Services here should stick to dependency wiring (Valkey adapter, site fragment registration) without reintroducing per-app copies of core logic.
- Add new fragment definitions in the site layer (`apps/site/fragments`) or a feature package and register them through the core registry rather than duplicating codec utilities here.
