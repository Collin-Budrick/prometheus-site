# Page config quick reference

- `page-config.json` controls per-route attributes like `render` (e.g., `"ssg"`) and `speculation` (`"prefetch" | "prerender" | "none"`). Read them via `getPageConfig`/`getPageSpeculation` in `page-config.ts`.
- `bun run build` runs `sync:page-config` to auto-add new folder-based `index.*` routes; dynamic segments and non-index route files still need manual entries.
- When adding routes that should be statically generated, update `page-config.json`, ensure `onStaticGenerate` covers the locale, and pick a speculation mode that matches the page’s cacheability.
