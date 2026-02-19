# Native Config Reference

This document defines the native Tauri config model and environment contracts for dev and production.

## Config Overlay Model

- Base config: `apps/tauri/src-tauri/tauri.conf.base.json`
- Dev overlay: `apps/tauri/src-tauri/tauri.conf.dev.json`
- Prod overlay: `apps/tauri/src-tauri/tauri.conf.prod.json`
- Generated runtime config target: `apps/tauri/src-tauri/tauri.conf.json`
- Merge logic: `apps/tauri/scripts/tauri.ts` via `TAURI_CONFIG` runtime injection.

Profile selection:

- `tauri dev` defaults to `dev`.
- `tauri build` defaults to `prod`.
- Override with `PROMETHEUS_TAURI_PROFILE=dev|prod`.

## Identity and Deep Links

Development defaults:

- Bundle identifier: `com.prometheus.site`
- Deep-link scheme: `dev.prometheus.site://...`
- Mobile deep-link host: `dev.prometheus.site`

Production defaults:

- Bundle identifier: `com.prometheus.app`
- Deep-link scheme: `prometheus://open/...`
- Mobile deep-link host: `open`

## API Endpoint Rules

- Native production builds must set an absolute remote `VITE_API_BASE`.
- Localhost, loopback, or relative values are rejected in production build mode by `apps/tauri/scripts/tauri.ts`.
- Runtime topology is remote API only; no embedded local API service.

## Updater Configuration

Desktop only:

- Enabled in prod profile.
- Disabled in dev profile.
- Disabled for mobile targets even in prod profile.

Environment:

- `PROMETHEUS_TAURI_UPDATER_PUBKEY` (required for production desktop build)
- `PROMETHEUS_TAURI_UPDATER_ENDPOINTS` (optional comma/newline list)

Default endpoint fallback:

- `https://github.com/prometheus-site/prometheus-site/releases/latest/download/latest.json`

## Native Service Worker Policy

- Native builds (`VITE_TAURI=1`) do not generate or register service worker assets.
- Browser/PWA builds keep existing service worker behavior.

## Push Provider Environment

Web push:

- `PUSH_VAPID_PUBLIC_KEY`
- `PUSH_VAPID_PRIVATE_KEY`
- `PUSH_VAPID_SUBJECT`

Android native push (FCM):

- `PUSH_FCM_PROJECT_ID`
- `PUSH_FCM_CLIENT_EMAIL`
- `PUSH_FCM_PRIVATE_KEY`

iOS native push (APNs):

- `PUSH_APNS_KEY_ID`
- `PUSH_APNS_TEAM_ID`
- `PUSH_APNS_BUNDLE_ID`
- `PUSH_APNS_PRIVATE_KEY`
- `PUSH_APNS_USE_SANDBOX`

## Capabilities and Security

Scoped capability files:

- Desktop: `apps/tauri/src-tauri/capabilities/desktop.json`
- Mobile: `apps/tauri/src-tauri/capabilities/mobile.json`

Constraints:

- Filesystem is app-data scoped.
- Shell is open-only for safe URL schemes.
- Plugin permissions are explicit per platform capability profile.
