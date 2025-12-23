Put build-only static assets here (e.g., large data files, wasm, workers).

Vite copies everything from this folder into dist/static/ on build/preview.
Use in routes as /static/<path>.

Example:
- apps/web/static-copy/wasm/engine.wasm -> /static/wasm/engine.wasm
