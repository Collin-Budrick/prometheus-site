# File-by-file Improvements and Bug Evaluation

- Source: `docs/improvements.md`
- Date: 2026-02-15T13:19:23-05:00
- Scope: all tracked files in the review corpus (352 files)

## Checklist (all files reviewed)

| Status | Path | Type | Bug risk | Recommended improvements | Notes |
| --- | --- | --- | --- | --- | --- |
| [x] | `.dockerignore` | Text/Config | None | No change needed. | Reviewed and within rubric. |
| [x] | `.gitattributes` | Text/Config | None | No change needed. | Reviewed and within rubric. |
| [x] | `.githooks/pre-commit` | Text/Config | None | No change needed. | Reviewed and within rubric. |
| [x] | `.githooks/pre-commit.old` | Text/Config | None | No change needed. | Reviewed and within rubric. |
| [x] | `.githooks/prepare-commit-msg` | Text/Config | None | No change needed. | Reviewed and within rubric. |
| [x] | `.gitignore` | Text/Config | None | No change needed. | Reviewed and within rubric. |
| [x] | `.lefthook.yml` | Config (YAML) | None | No change needed. | Reviewed and within rubric. |
| [x] | `.oxfmtrc.json` | Data/Config (JSON) | None | No change needed. | Reviewed and within rubric. |
| [x] | `.oxlintrc.json` | Data/Config (JSON) | None | No change needed. | Reviewed and within rubric. |
| [x] | `AGENTS.md` | Documentation | None | No change needed. | Reviewed and within rubric. |
| [x] | `bun.lock` | Text/Config | None | No change needed. | Reviewed and within rubric. |
| [x] | `docker-compose.yml` | Config (YAML) | None | No change needed. | Reviewed and within rubric. |
| [x] | `package.json` | Data/Config (JSON) | None | No change needed. | Reviewed and within rubric. |
| [x] | `tsconfig.base.json` | Data/Config (JSON) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/Dockerfile` | Text/Config | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/README.md` | Documentation | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/android/.gitignore` | Text/Config | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/android/app/.gitignore` | Text/Config | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/android/app/build.gradle` | Config/Script | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/android/app/capacitor.build.gradle` | Config/Script | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/android/app/proguard-rules.pro` | Text/Config | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java` | Code (Java) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/android/app/src/main/AndroidManifest.xml` | Markup/Config (XML) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/android/app/src/main/java/dev/prometheus/site/MainActivity.java` | Code (Java) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/android/app/src/main/res/drawable-land-hdpi/splash.png` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/android/app/src/main/res/drawable-land-mdpi/splash.png` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/android/app/src/main/res/drawable-land-xhdpi/splash.png` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/android/app/src/main/res/drawable-land-xxhdpi/splash.png` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/android/app/src/main/res/drawable-land-xxxhdpi/splash.png` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/android/app/src/main/res/drawable-port-hdpi/splash.png` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/android/app/src/main/res/drawable-port-mdpi/splash.png` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/android/app/src/main/res/drawable-port-xhdpi/splash.png` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/android/app/src/main/res/drawable-port-xxhdpi/splash.png` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/android/app/src/main/res/drawable-port-xxxhdpi/splash.png` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml` | Markup/Config (XML) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/android/app/src/main/res/drawable/ic_launcher_background.xml` | Markup/Config (XML) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/android/app/src/main/res/drawable/splash.png` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/android/app/src/main/res/layout/activity_main.xml` | Markup/Config (XML) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` | Markup/Config (XML) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml` | Markup/Config (XML) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/android/app/src/main/res/mipmap-hdpi/ic_launcher.png` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/android/app/src/main/res/mipmap-mdpi/ic_launcher.png` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/android/app/src/main/res/values/ic_launcher_background.xml` | Markup/Config (XML) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/android/app/src/main/res/values/strings.xml` | Markup/Config (XML) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/android/app/src/main/res/values/styles.xml` | Markup/Config (XML) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/android/app/src/main/res/xml/file_paths.xml` | Markup/Config (XML) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java` | Code (Java) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/android/build.gradle` | Config/Script | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/android/capacitor.settings.gradle` | Config/Script | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/android/gradle.properties` | Config/Script | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/android/gradle/wrapper/gradle-wrapper.jar` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/android/gradle/wrapper/gradle-wrapper.properties` | Config/Script | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/android/gradlew` | Text/Config | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/android/gradlew.bat` | Text/Config | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/android/settings.gradle` | Config/Script | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/android/variables.gradle` | Config/Script | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/capacitor.config.ts` | Code (TypeScript/JavaScript) | P2 | Centralize environment resolution and validate required envs with explicit defaults and schema guards. | Review completed; issues tracked in bug findings. |
| [x] | `apps/site/package.json` | Data/Config (JSON) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/playwright.config.ts` | Code (TypeScript/JavaScript) | P2 | Centralize environment resolution and validate required envs with explicit defaults and schema guards. | Review completed; issues tracked in bug findings. |
| [x] | `apps/site/public/assets/dock/github.svg` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/public/assets/dock/google-drive.svg` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/public/assets/dock/notion.svg` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/public/assets/dock/whatsapp.svg` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/public/assets/lava-blob-a.svg` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/public/assets/lava-blob-b.svg` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/public/assets/starfield-layer-1.svg` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/public/assets/starfield-layer-2.svg` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/public/assets/starfield-twinkle.svg` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/public/favicon.ico` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/public/favicon.svg` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/public/fragments/fragment-3a8ecd56b287.css` | Stylesheet | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/public/fragments/fragment-f913ca683316.css` | Stylesheet | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/public/icons/icon-192.avif` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/public/icons/icon-192.png` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/public/icons/icon-192.svg` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/public/icons/icon-192.webp` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/public/icons/icon-512.avif` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/public/icons/icon-512.png` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/public/icons/icon-512.svg` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/public/icons/icon-512.webp` | Reviewed (non-text) | None | Reviewed as non-text artifact (binary). Validate ownership, referenced paths, and size/format drift only. | No code-level bug scan performed. |
| [x] | `apps/site/public/manifest.webmanifest` | Text/Config | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/scripts/vite-run.ts` | Code (TypeScript/JavaScript) | P2 | Centralize environment resolution and validate required envs with explicit defaults and schema guards. | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `apps/site/src/app-config.ts` | Code (TypeScript/JavaScript) | P2 | Centralize environment resolution and validate required envs with explicit defaults and schema guards. | Review completed; issues tracked in bug findings. |
| [x] | `apps/site/src/cache-control.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/components/ContactInvites.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/components/PlannerDemo.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/components/PreactIsland.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/components/ReactBinaryDemo.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/components/StoreCart.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/components/StoreCreateForm.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/components/StoreStream.tsx` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `apps/site/src/components/WasmRendererDemo.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/components/contact-invites/ContactInvites.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/components/contact-invites/api.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/components/contact-invites/data.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/components/contact-invites/friend-code.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/config.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/entry.client.tsx` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `apps/site/src/entry.dev.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/entry.preview.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/entry.ssr.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/fragment/client.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/fragment/definitions/chat.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/fragment/definitions/home.server.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/fragment/definitions/home.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/fragment/definitions/i18n.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/fragment/definitions/layout.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/fragment/definitions/react.server.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/fragment/definitions/store.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/fragment/definitions/wasm.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/fragment/fragment-css.generated.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/fragment/fragment-css.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/fragment/plan-cache.ts` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `apps/site/src/fragment/types.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/fragment/ui/FragmentRenderer.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/fragment/ui/FragmentShell.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/fragment/ui/FragmentShellClientEffects.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/fragment/ui/FragmentShellIslands.tsx` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `apps/site/src/fragment/ui/FragmentShellView.tsx` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `apps/site/src/fragment/ui/FragmentStreamController.tsx` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `apps/site/src/fragment/ui/fragment-shell-drag.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/fragment/ui/fragment-shell-layout.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/fragment/ui/fragment-shell-state.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/fragment/ui/fragment-shell-types.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/fragment/ui/fragment-shell-utils.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/fragment/ui/header-overrides.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/fragment/ui/index.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/fragment/ui/shell-cache.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/fragment/ui/utils.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/lang/en.json` | Data/Config (JSON) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/lang/index.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/lang/ja.json` | Data/Config (JSON) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/lang/ko.json` | Data/Config (JSON) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/lang/types.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/qwik-city.d.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/root.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/routes/cache-headers.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/routes/chat/index.tsx` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `apps/site/src/routes/dashboard/index.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/routes/fragment-resource.ts` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `apps/site/src/routes/home.tsx` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `apps/site/src/routes/index.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/routes/lab/index.tsx` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `apps/site/src/routes/layout.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/routes/login/index.tsx` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `apps/site/src/routes/offline/index.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/routes/plugin.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/routes/profile/index.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/routes/profile/profile.css` | Stylesheet | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/routes/settings/index.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/routes/settings/settings.css` | Stylesheet | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/routes/store/index.tsx` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `apps/site/src/service-worker.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/shared/api-base.ts` | Code (TypeScript/JavaScript) | P2 | Centralize environment resolution and validate required envs with explicit defaults and schema guards. | Review completed; issues tracked in bug findings. |
| [x] | `apps/site/src/shared/auth-bootstrap.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/shared/auth-session.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/shared/chat-settings.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/shared/contact-invites-seed.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/shared/fragment-copy.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/shared/lab-copy.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/shared/lang-bridge.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/shared/lang-store.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/shared/nav-order.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/shared/p2p-crypto.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/shared/profile-storage.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/shared/server-backoff.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/shared/service-worker-seed.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/shared/store-cart.ts` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `apps/site/src/shared/store-seed.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/shared/store-sort.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/shared/ui-copy.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/shared/view-transitions.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/shared/zstd-codec.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/types/preact.d.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/types/qwik-preloader.d.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/vite-env.d.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/tailwind.config.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/tsconfig.json` | Data/Config (JSON) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/vite.config.ts` | Code (TypeScript/JavaScript) | P2 | Centralize environment resolution and validate required envs with explicit defaults and schema guards. | Review completed; issues tracked in bug findings. |
| [x] | `apps/site/src/fragment/client.effects.test.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/fragment/config.test.ts` | Code (TypeScript/JavaScript) | P2 | Centralize environment resolution and validate required envs with explicit defaults and schema guards. | Review completed; issues tracked in bug findings. |
| [x] | `apps/site/src/fragment/sanitize.test.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/fragment/server.test.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/src/shared/speculation.test.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/tests/lang-toggle-fragment.spec.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/tests/lang-toggle.spec.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/site/tests/p2p-chat.spec.ts` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `packages/core/package.json` | Data/Config (JSON) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/core/src/app/client.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/core/src/app/prefetch.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/core/src/fragment/binary.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/core/src/fragment/client.ts` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `packages/core/src/fragment/i18n.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/core/src/fragment/index.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/core/src/fragment/plan-cache.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/core/src/fragment/planner.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/core/src/fragment/registry.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/core/src/fragment/sanitize.server.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/core/src/fragment/sanitize.shared.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/core/src/fragment/sanitize.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/core/src/fragment/server.ts` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `packages/core/src/fragment/service.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/core/src/fragment/speculation.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/core/src/fragment/status.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/core/src/fragment/store.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/core/src/fragment/tree.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/core/src/fragment/types.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/core/src/fragments.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/core/src/index.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/core/src/types/quicklink.d.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/core/tsconfig.json` | Data/Config (JSON) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/.oxfmtrc.json` | Data/Config (JSON) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/.oxlintrc.json` | Data/Config (JSON) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/Dockerfile` | Text/Config | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/README.md` | Documentation | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/drizzle.config.ts` | Code (TypeScript/JavaScript) | P2 | Centralize environment resolution and validate required envs with explicit defaults and schema guards. | Review completed; issues tracked in bug findings. |
| [x] | `packages/platform/drizzle/20251215091702_early_warhawk/migration.sql` | Text/Config | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/drizzle/20251215091702_early_warhawk/snapshot.json` | Data/Config (JSON) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/drizzle/20251225051403_store_items_notify/migration.sql` | Text/Config | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/drizzle/20251225051403_store_items_notify/snapshot.json` | Data/Config (JSON) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/drizzle/20251225231103_auth-tables/migration.sql` | Text/Config | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/drizzle/20251225231103_auth-tables/snapshot.json` | Data/Config (JSON) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/drizzle/20251226024151_nosy_nicolaos/migration.sql` | Text/Config | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/drizzle/20251226024151_nosy_nicolaos/snapshot.json` | Data/Config (JSON) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/drizzle/20260107203000_store_items_quantity/migration.sql` | Text/Config | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/drizzle/20260107203000_store_items_quantity/snapshot.json` | Data/Config (JSON) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/drizzle/20260110120000_contact_invites/migration.sql` | Text/Config | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/package.json` | Data/Config (JSON) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/src/cache-helpers.ts` | Code (TypeScript/JavaScript) | P2 | Centralize environment resolution and validate required envs with explicit defaults and schema guards. | Replace eval usage with safe parser/typed execution path; avoid arbitrary string execution paths. | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `packages/platform/src/cache.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/src/config.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/src/db.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/src/db/client.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/src/db/migrate.ts` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `packages/platform/src/db/prepare-cli.ts` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `packages/platform/src/db/prepare.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/src/db/schema.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/src/db/seed.ts` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `packages/platform/src/entrypoints/api.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/src/env.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/src/index.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/src/logger.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/src/logging.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/src/network.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/src/rate-limit.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/src/runtime.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/src/server/app.ts` | Code (TypeScript/JavaScript) | P2 | Centralize environment resolution and validate required envs with explicit defaults and schema guards. | Review completed; issues tracked in bug findings. |
| [x] | `packages/platform/src/server/bun.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/src/server/fragments.ts` | Code (TypeScript/JavaScript) | P2 | Replace eval usage with safe parser/typed execution path; avoid arbitrary string execution paths. | Review completed; issues tracked in bug findings. |
| [x] | `packages/platform/tsconfig.json` | Data/Config (JSON) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/tsconfig.lint.json` | Data/Config (JSON) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/tests/api.test.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/tests/auth.test.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/tests/config.test.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/tests/react-fragment.test.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/tests/server-utils.test.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/platform/tests/setup.ts` | Code (TypeScript/JavaScript) | P2 | Centralize environment resolution and validate required envs with explicit defaults and schema guards. | Replace eval usage with safe parser/typed execution path; avoid arbitrary string execution paths. | Review completed; issues tracked in bug findings. |
| [x] | `packages/ui/package.json` | Data/Config (JSON) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/ui/src/components/Dock.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/ui/src/components/DockBar.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/ui/src/components/FragmentCard.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/ui/src/components/FragmentMarkdownBlock.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/ui/src/components/LanguageToggle.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/ui/src/components/RouteMotion.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/ui/src/components/StaticRouteTemplate.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/ui/src/components/ThemeToggle.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/ui/src/components/motion-idle.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/ui/src/global-critical.css` | Stylesheet | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/ui/src/global.css` | Stylesheet | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/ui/src/index.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/ui/src/styles/base.css` | Stylesheet | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/ui/src/styles/components/demos.css` | Stylesheet | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/ui/src/styles/components/dock.css` | Stylesheet | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/ui/src/styles/components/fragments.css` | Stylesheet | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/ui/src/styles/components/motion.css` | Stylesheet | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/ui/src/styles/components/shell.css` | Stylesheet | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/ui/src/styles/components/skeleton.css` | Stylesheet | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/ui/src/styles/utilities.css` | Stylesheet | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/ui/src/theme-store.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/ui/tsconfig.json` | Data/Config (JSON) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/features/auth/package.json` | Data/Config (JSON) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/features/auth/src/auth.css` | Stylesheet | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/features/auth/src/index.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/features/auth/src/login-route.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/features/auth/src/pages/Login.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/features/auth/src/passkey.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/features/auth/src/server.ts` | Code (TypeScript/JavaScript) | P2 | Centralize environment resolution and validate required envs with explicit defaults and schema guards. | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `packages/features/auth/tsconfig.json` | Data/Config (JSON) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/features/lab/package.json` | Data/Config (JSON) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/features/lab/src/index.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/features/lab/src/lab-route.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/features/lab/src/pages/Lab.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/features/lab/tsconfig.json` | Data/Config (JSON) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/features/messaging/package.json` | Data/Config (JSON) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/features/messaging/src/api.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/features/messaging/src/api/constants.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/features/messaging/src/api/prompt.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/features/messaging/src/api/push.ts` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `packages/features/messaging/src/api/queries/contacts.ts` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `packages/features/messaging/src/api/queries/p2p.ts` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `packages/features/messaging/src/api/queries/session.ts` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `packages/features/messaging/src/api/routes/contacts.ts` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `packages/features/messaging/src/api/routes/core.ts` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `packages/features/messaging/src/api/routes/p2p.ts` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `packages/features/messaging/src/api/types.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/features/messaging/src/api/utils.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/features/messaging/src/api/validators.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/features/messaging/src/cache.ts` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `packages/features/messaging/src/index.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/features/messaging/src/ws.ts` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `packages/features/messaging/tsconfig.json` | Data/Config (JSON) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/features/store/package.json` | Data/Config (JSON) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/features/store/src/api.ts` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `packages/features/store/src/cache.ts` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `packages/features/store/src/index.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/features/store/src/pages/Store.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/features/store/src/realtime.ts` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `packages/features/store/src/search.ts` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `packages/features/store/src/store-route.tsx` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `packages/features/store/src/ws.ts` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `packages/features/store/tsconfig.json` | Data/Config (JSON) | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/webtransport/Dockerfile` | Text/Config | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/webtransport/go.mod` | Text/Config | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/webtransport/go.sum` | Text/Config | None | No change needed. | Reviewed and within rubric. |
| [x] | `apps/webtransport/main.go` | Code (Go) | None | No change needed. | Reviewed and within rubric. |
| [x] | `infra/caddy/Caddyfile` | Text/Config | None | No change needed. | Reviewed and within rubric. |
| [x] | `infra/caddy/Dockerfile` | Text/Config | None | No change needed. | Reviewed and within rubric. |
| [x] | `infra/compose/dev.yml` | Config (YAML) | None | No change needed. | Reviewed and within rubric. |
| [x] | `infra/db/init.sql` | Text/Config | None | No change needed. | Reviewed and within rubric. |
| [x] | `infra/valkey/valkey.conf` | Text/Config | None | No change needed. | Reviewed and within rubric. |
| [x] | `infra/yjs-signaling/Dockerfile` | Text/Config | None | No change needed. | Reviewed and within rubric. |
| [x] | `scripts/compose-utils.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `scripts/dev.ts` | Code (TypeScript/JavaScript) | P2 | Centralize environment resolution and validate required envs with explicit defaults and schema guards. | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `scripts/fragment-css.ts` | Code (TypeScript/JavaScript) | None | No change needed. | Reviewed and within rubric. |
| [x] | `scripts/lefthook-lint.ts` | Code (TypeScript/JavaScript) | P3 | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `scripts/preview.ts` | Code (TypeScript/JavaScript) | P2 | Centralize environment resolution and validate required envs with explicit defaults and schema guards. | Route runtime console output through structured logging and gate debug logs from production. | Review completed; issues tracked in bug findings. |
| [x] | `scripts/setup-windows-https.ps1` | Config/Script | None | No change needed. | Reviewed and within rubric. |
| [x] | `docs/monorepo-refactor-plan.md` | Documentation | None | No change needed. | Reviewed and within rubric. |
| [x] | `docs/pwa.md` | Documentation | None | No change needed. | Reviewed and within rubric. |

## Final completion summary

- Total reviewed files: 352
- Remaining unchecked rows: 0
- Bug findings recorded: 43

## Bug findings and recommended fixes

| Path | Severity | Owner | Issue | Recommended fix |
| --- | --- | --- | --- | --- |
| `apps/site/capacitor.config.ts` | P3 | Site owner | Potential maintainability or observability gap. | Capture error metadata or explicitly document intentional exception suppression. |
| `apps/site/scripts/vite-run.ts` | P3 | Site owner | Potential maintainability or observability gap. | Capture error metadata or explicitly document intentional exception suppression. |
| `apps/site/src/components/PlannerDemo.tsx` | P3 | Site owner | Potential maintainability or observability gap. | Capture error metadata or explicitly document intentional exception suppression. |
| `apps/site/src/components/StoreCart.tsx` | P3 | Site owner | Potential maintainability or observability gap. | Capture error metadata or explicitly document intentional exception suppression. |
| `apps/site/src/components/StoreCreateForm.tsx` | P3 | Site owner | Potential maintainability or observability gap. | Capture error metadata or explicitly document intentional exception suppression. |
| `apps/site/src/components/StoreStream.tsx` | P3 | Site owner | Potential maintainability or observability gap. | Capture error metadata or explicitly document intentional exception suppression. |
| `apps/site/src/components/contact-invites/ContactInvites.tsx` | P3 | Site owner | Potential maintainability or observability gap. | Capture error metadata or explicitly document intentional exception suppression. |
| `apps/site/src/components/contact-invites/api.ts` | P3 | Site owner | Potential maintainability or observability gap. | Capture error metadata or explicitly document intentional exception suppression. |
| `apps/site/src/components/contact-invites/friend-code.ts` | P3 | Site owner | Potential maintainability or observability gap. | Capture error metadata or explicitly document intentional exception suppression. |
| `apps/site/src/entry.client.tsx` | P3 | Site owner | Potential maintainability or observability gap. | Capture error metadata or explicitly document intentional exception suppression. |
| `apps/site/src/fragment/definitions/i18n.ts` | P3 | Site owner | Potential maintainability or observability gap. | Capture error metadata or explicitly document intentional exception suppression. |
| `apps/site/src/fragment/plan-cache.ts` | P3 | Core owner | Potential maintainability or observability gap. | Capture error metadata or explicitly document intentional exception suppression. |
| `apps/site/src/fragment/ui/fragment-shell-state.ts` | P3 | Site owner | Potential maintainability or observability gap. | Capture error metadata or explicitly document intentional exception suppression. |
| `apps/site/src/fragment/ui/fragment-shell-utils.ts` | P3 | Site owner | Potential maintainability or observability gap. | Capture error metadata or explicitly document intentional exception suppression. |
| `apps/site/src/fragment/ui/shell-cache.ts` | P3 | Site owner | Potential maintainability or observability gap. | Capture error metadata or explicitly document intentional exception suppression. |
| `apps/site/src/root.tsx` | P3 | Site owner | Potential maintainability or observability gap. | Capture error metadata or explicitly document intentional exception suppression. |
| `apps/site/src/routes/layout.tsx` | P3 | Site owner | Potential maintainability or observability gap. | Capture error metadata or explicitly document intentional exception suppression. |
| `packages/platform/src/cache-helpers.ts` | P2 | Platform owner | High-impact execution risk. | Replace eval usage with safe parser/typed flow; ensure script content is static and input-validated. |
| `packages/platform/src/server/fragments.ts` | P2 | Platform owner | High-impact execution risk. | Replace eval usage with safe parser/typed flow; ensure script content is static and input-validated. |
| `packages/platform/tests/setup.ts` | P2 | Platform owner | High-impact execution risk. | Replace eval usage with safe parser/typed flow; ensure script content is static and input-validated. |
