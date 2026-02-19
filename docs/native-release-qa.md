# Native Release QA Gates

This document defines hard pass/fail criteria for desktop, Android, and iOS native releases.

## Required Functional Scenarios

- Cold start from launcher to first interactive tap.
- Warm start and resume from background with app state preserved.
- Deep link open on cold start and warm start (`prometheus://open/...` in prod, `dev.prometheus.site://...` in dev).
- Push notification tap deep link into `/chat` and `/profile`.
- Route transition stress test (10+ route changes).
- Large text (`140%`) pass across login, chat, settings, and profile.
- Screen-reader pass (TalkBack + VoiceOver) for focus order and actionable controls.

## Desktop-Only Required Scenarios

- Native menu items work: About, Preferences, Check for Updates, Quit.
- Tray actions work: Show/Hide, Check for Updates, Quit.
- Updater check/install path succeeds from signed release manifest.
- Updater does not run on Android/iOS builds.

## Telemetry Gates (p95)

- `startup-interactive-ms` <= `2200`.
- `deep-link-latency-ms` <= `1200`.
- `transition-jank-ms` <= `55` over budget.
- `long-task-ms` <= `180`.

Any p95 breach is a release blocker unless waived in release notes with owner and remediation date.

## Security and Policy Gates

- Production native builds use absolute remote `VITE_API_BASE`; localhost/relative API base is rejected.
- Native builds run with service worker disabled (`VITE_TAURI=1` path).
- Desktop updater artifacts are signed and signature verification passes.
- Desktop updater endpoint metadata is from GitHub Releases (`latest.json`).
- Shell opening is limited to `http`, `https`, `mailto`, `tel`.
- Filesystem access is scoped to app-data paths via capability profile.

## Accessibility Checklist

- No clipped labels/buttons at text zoom 140%.
- Logical focus order on Settings toggles and range control.
- Notification permission prompt appears contextually (post-user intent), not on first frame.
- Privacy screen enabled on pause/background and sensitive routes.

## Native Configuration Gates

- Android: `google-services.json` present for release lane.
- Android: FCM metadata and default notification channel (`messages`) configured.
- iOS: APNs entitlement (`aps-environment`) enabled for release lane.
- iOS: background modes include `remote-notification` and `fetch`.
- iOS: foreground notification presentation uses banner/sound/badge.

## Desktop Signing/Updater Pass-Fail Checklist

- `PASS`:
  - Release artifacts are signed on all desktop targets.
  - `latest.json` references the shipped versions and signatures.
  - In-app `Check for Updates` shows `up-to-date` when current, and installs when newer release exists.
  - App restarts into the newly installed version.
- `FAIL`:
  - Any unsigned desktop artifact.
  - Missing or invalid signature in updater metadata.
  - Updater check/install error on any supported desktop target.
  - Version mismatch between installed binary and release metadata.
