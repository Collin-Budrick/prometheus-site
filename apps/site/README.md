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
