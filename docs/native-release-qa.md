# Native release QA gates

This document defines go/no-go thresholds for native-feel quality on Android and iOS builds.

## Required scenarios

- Cold start from launcher to first interactive tap.
- Push notification tap deep link into chat and profile routes.
- Route transition stress test (10+ route changes).
- Large text (`140%`) pass across login, chat, settings, and profile.
- Screen-reader pass (TalkBack + VoiceOver) for focus order and actionable controls.

## Telemetry gates (p95)

- `startup-interactive-ms` ≤ **2200ms**.
- `deep-link-latency-ms` ≤ **1200ms**.
- `transition-jank-ms` ≤ **55ms** over budget.
- `long-task-ms` ≤ **180ms**.

Any p95 breach is a release blocker unless explicitly waived in release notes with mitigation timeline.

## Accessibility QA checklist

- No clipped labels/buttons at text zoom 140%.
- Logical focus order on Settings toggles and range control.
- Notification permission prompt appears contextually (post-user intent), not on first frame.
- Privacy screen enabled on pause/background and sensitive routes.

## Native configuration gates

- Android: `google-services.json` present in the Tauri Android project for release lanes.
- Android: FCM metadata and notification default channel (`messages`) configured.
- iOS: APNs entitlement (`aps-environment`) and background modes (`remote-notification`, `fetch`) enabled.
- iOS: foreground notification presentation uses banner/sound/badge.
