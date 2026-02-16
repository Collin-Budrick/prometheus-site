# Android native integration notes

## Firebase / Push setup

- Place the Firebase config file at `apps/site/android/app/google-services.json` (do not commit secrets).
- Gradle integration is enabled in:
  - `apps/site/android/build.gradle` (`com.google.gms:google-services` classpath).
  - `apps/site/android/app/build.gradle` (conditional `apply plugin: 'com.google.gms.google-services'`).
- The manifest sets a default notification channel id (`messages`) plus fallback icon/color metadata.

## Quick verification

```bash
test -f apps/site/android/app/google-services.json
./gradlew :app:assembleDebug
```
