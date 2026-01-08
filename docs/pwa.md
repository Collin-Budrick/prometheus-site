# PWA / Service Worker

The site uses Serwist (via `@serwist/vite`) to build the service worker from
`apps/site/src/service-worker.ts` and emit `/service-worker.js` during the Vite
build. This replaces the older Workbox/vite-plugin-pwa setup while keeping the
same registration flow in `apps/site/src/entry.client.tsx`.

The web manifest still lives at `apps/site/public/manifest.webmanifest`, and
the Serwist precache list is extended with the app shell and icon assets.
