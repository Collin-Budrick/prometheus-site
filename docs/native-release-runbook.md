# Native Release Runbook

This runbook covers desktop/mobile release execution, signing expectations, key rotation, and rollback.

## 1. Preconditions

- QA gates in `docs/native-release-qa.md` are green.
- Release version/tag prepared (`vX.Y.Z`).
- Required secrets configured in GitHub repository settings.
- For mobile lanes, Android SDK/Xcode prerequisites are available on runner.

## 2. Required Repository Secrets

Desktop workflow (`native-desktop-release.yml`):

- `VITE_API_BASE_PROD`
- `PROMETHEUS_TAURI_UPDATER_PUBKEY`
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Mobile workflow (`native-mobile-release.yml`):

- `VITE_API_BASE_PROD`
- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `APPLE_CERT_BASE64`
- `APPLE_CERT_PASSWORD`
- `APPLE_PROVISIONING_PROFILE_BASE64`
- `APPLE_TEAM_ID`

Both release workflows fail early when required secrets are missing.

## 3. Local Release Dry Run

Desktop dry run:

```bash
bun install --frozen-lockfile
PROMETHEUS_TAURI_PROFILE=prod VITE_TAURI=1 VITE_API_BASE=https://api.prometheus.dev \
  PROMETHEUS_TAURI_UPDATER_PUBKEY="$PROMETHEUS_TAURI_UPDATER_PUBKEY" \
  bun run tauri:release:desktop
```

Mobile dry run:

```bash
bun install --frozen-lockfile
bun run tauri:mobile:init
PROMETHEUS_TAURI_PROFILE=prod VITE_TAURI=1 VITE_API_BASE=https://api.prometheus.dev \
  bun run tauri:release:mobile
```

## 4. CI Release Execution

Desktop:

1. Create/push release tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.
2. `native-desktop-release.yml` builds/signs artifacts for Linux, Windows, and macOS (arm64 + x64).
3. Workflow uploads release artifacts and updater metadata to GitHub Releases.

Mobile:

1. Trigger `native-mobile-release.yml` manually.
2. Select `release_channel` and `release_track` inputs.
3. Build artifacts are produced and uploaded as workflow artifacts.
4. Store upload/promotion occurs via your store release process.

PR smoke:

- `native-pr-smoke.yml` validates compile/build paths without publishing.

## 5. Updater Verification (Desktop)

- Open app and run menu/tray action `Check for Updates`.
- Verify:
  - no update available path on latest build;
  - update available path downloads, installs, and relaunches;
  - post-update app version matches release tag.

## 6. Key Rotation

Tauri updater keys:

1. Generate new updater keypair: `bun run tauri:keys:generate`.
2. Store new private key/password in repo secrets.
3. Update `PROMETHEUS_TAURI_UPDATER_PUBKEY` secret to new public key.
4. Publish a new signed desktop release.

Android signing key rotation:

- Follow Play Console key upgrade flow and update keystore secrets.

iOS signing rotation:

- Rotate cert/profile in Apple Developer portal and update corresponding secrets.

## 7. Rollback Procedure

Desktop rollback:

1. Revoke bad release from GitHub Releases (or mark as non-latest).
2. Publish previous known-good signed release metadata as latest.
3. Validate updater check returns known-good version.

Mobile rollback:

1. Halt rollout / phased release in Play/App Store.
2. Promote prior stable build in store console.
3. Communicate rollback status and expected re-release window.

## 8. Incident Notes Template

For each rollback or emergency release, capture:

- tag/version
- affected platform(s)
- failure mode
- mitigation
- follow-up owner and deadline
