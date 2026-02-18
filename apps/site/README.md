# Site (Qwik)

## Enable Highlight in production builds

Highlight is disabled by default. To turn it on for a production build, set these build-time env vars:

- `VITE_ENABLE_HIGHLIGHT=1`
- `VITE_HIGHLIGHT_PROJECT_ID=your-project-id`
- `VITE_HIGHLIGHT_SAMPLE_RATE=0.1` (optional, 0-1)

The Highlight SDK is compiled out unless `VITE_ENABLE_HIGHLIGHT=1` and `VITE_HIGHLIGHT_PROJECT_ID` are set at build time.

Optional tuning:

- `VITE_HIGHLIGHT_PRIVACY=strict`
- `VITE_HIGHLIGHT_SESSION_RECORDING=1`
- `VITE_HIGHLIGHT_CANVAS_SAMPLING=2`

Example (Bun build):

```
VITE_ENABLE_HIGHLIGHT=1 VITE_HIGHLIGHT_PROJECT_ID=your-project-id bun run --cwd apps/site build
```

Example (Docker build):

```
docker build -f apps/site/Dockerfile \
  --build-arg VITE_ENABLE_HIGHLIGHT=1 \
  --build-arg VITE_HIGHLIGHT_PROJECT_ID=your-project-id \
  --build-arg VITE_HIGHLIGHT_SAMPLE_RATE=0.1 \
  -t prometheus-site .
```

## Native shell architecture (Tauri)

`src/native/native-shell.ts` is the only allowed entrypoint for native runtime lifecycle or plugin wiring in the site app.

Rules:

- Initialize once from `src/root.tsx` in the client `useVisibleTask$` startup path.
- Keep all native event/listener registration in `initNativeShell()`.
- Include runtime guards so NativeShell is a no-op for web/PWA contexts.
- Use HMR-safe setup/teardown so listeners are not duplicated during local development.

## Native navigation and deep-link policy

### Android hardware/system back behavior

`NativeShell` enforces this handling order in native runtime:

1. Dismiss feature-level modal/sheet/overlay state (via `prometheus:native-back-intent` cancelable event, then close button/backdrop fallbacks).
2. Close keyboard (blur active input).
3. Navigate back (`history.back()`) when the user is not at root.
4. Exit app only at root route (`/`) and only on a repeated back press guard window.

Feature code that opens overlays must either:

- Register a listener for `prometheus:native-back-intent` and `preventDefault()` when it consumes dismissal, or
- Expose a close affordance with selectors used by `NativeShell` (`[data-native-dismiss="true"]`, etc.).

### Deep-link mapping rules

`NativeShell` handles both launch-time and runtime links:

- Cold start: `App.getLaunchUrl()`
- Warm start: `appUrlOpen`

Normalization rules:

- `http(s)` URLs map to `pathname + search + hash` and navigate in-app.
- Non-http schemes map to the best-effort path component.
- Relative links (`/path`, `?query`, `#hash`) are normalized to in-app routes.
- Malformed/unparseable URLs safely fall back to `/`.

When adding new routes, keep them addressable by normalized URL paths (no feature-only implicit state required to render the destination).
