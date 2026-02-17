#!/usr/bin/env bun

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = process.cwd();
const LOG_PREFIX = "[capacitor-android-patches]";
const collectNodeModuleRoots = () => {
  const baseRoots = [join(ROOT, "node_modules"), join(ROOT, "apps", "site", "node_modules")];
  const discovered = [...baseRoots];

  for (const baseRoot of baseRoots) {
    const bunStoreRoot = join(baseRoot, ".bun");
    if (!existsSync(bunStoreRoot)) continue;
    try {
      const entries = readdirSync(bunStoreRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const nestedNodeModules = join(bunStoreRoot, entry.name, "node_modules");
        if (existsSync(nestedNodeModules)) {
          discovered.push(nestedNodeModules);
        }
      }
    } catch {
      // Ignore transient filesystem issues; patching will continue with known roots.
    }
  }

  return Array.from(new Set(discovered));
};

const NODE_MODULE_ROOTS = collectNodeModuleRoots();
const ANDROID_ROOT = join(ROOT, "apps", "site", "android");

const patches: Array<{ relativePath: string; replacements: Array<{ find: string; replace: string }> }> = [
  {
    relativePath: join("@capacitor", "haptics", "android", "build.gradle"),
    replacements: [
      {
        find: "getDefaultProguardFile('proguard-android.txt')",
        replace: "getDefaultProguardFile('proguard-android-optimize.txt')",
      },
      {
        find: "classpath 'com.android.tools.build:gradle:8.13.0'",
        replace: "classpath 'com.android.tools.build:gradle:9.1.0-alpha09'",
      },
    ],
  },
  {
    relativePath: join("@capacitor", "keyboard", "android", "build.gradle"),
    replacements: [
      {
        find: "getDefaultProguardFile('proguard-android.txt')",
        replace: "getDefaultProguardFile('proguard-android-optimize.txt')",
      },
      {
        find: "classpath 'com.android.tools.build:gradle:8.13.0'",
        replace: "classpath 'com.android.tools.build:gradle:9.1.0-alpha09'",
      },
    ],
  },
  {
    relativePath: join("@capacitor-community", "in-app-review", "android", "build.gradle"),
    replacements: [
      {
        find: "getDefaultProguardFile('proguard-android.txt')",
        replace: "getDefaultProguardFile('proguard-android-optimize.txt')",
      },
      {
        find: "classpath 'com.android.tools.build:gradle:8.13.0'",
        replace: "classpath 'com.android.tools.build:gradle:9.1.0-alpha09'",
      },
    ],
  },
  {
    relativePath: join("@capacitor-community", "sqlite", "android", "build.gradle"),
    replacements: [
      {
        find: "getDefaultProguardFile('proguard-android.txt')",
        replace: "getDefaultProguardFile('proguard-android-optimize.txt')",
      },
      {
        find: "classpath 'com.android.tools.build:gradle:8.13.0'",
        replace: "classpath 'com.android.tools.build:gradle:9.1.0-alpha09'",
      },
    ],
  },
  {
    relativePath: join("@capawesome", "capacitor-app-shortcuts", "android", "build.gradle"),
    replacements: [
      {
        find: "getDefaultProguardFile('proguard-android.txt')",
        replace: "getDefaultProguardFile('proguard-android-optimize.txt')",
      },
      {
        find: "classpath 'com.android.tools.build:gradle:8.13.0'",
        replace: "classpath 'com.android.tools.build:gradle:9.1.0-alpha09'",
      },
    ],
  },
  {
    relativePath: join("@capawesome", "capacitor-app-update", "android", "build.gradle"),
    replacements: [
      {
        find: "getDefaultProguardFile('proguard-android.txt')",
        replace: "getDefaultProguardFile('proguard-android-optimize.txt')",
      },
      {
        find: "classpath 'com.android.tools.build:gradle:8.13.0'",
        replace: "classpath 'com.android.tools.build:gradle:9.1.0-alpha09'",
      },
    ],
  },
  {
    relativePath: join("@capgo", "capacitor-autofill-save-password", "android", "build.gradle"),
    replacements: [
      {
        find: "getDefaultProguardFile('proguard-android.txt')",
        replace: "getDefaultProguardFile('proguard-android-optimize.txt')",
      },
      {
        find: "classpath 'com.android.tools.build:gradle:8.13.0'",
        replace: "classpath 'com.android.tools.build:gradle:9.1.0-alpha09'",
      },
    ],
  },
  {
    relativePath: join("@capgo", "capacitor-social-login", "android", "build.gradle"),
    replacements: [
      {
        find: "getDefaultProguardFile('proguard-android.txt')",
        replace: "getDefaultProguardFile('proguard-android-optimize.txt')",
      },
      {
        find: "classpath 'com.android.tools.build:gradle:8.13.0'",
        replace: "classpath 'com.android.tools.build:gradle:9.1.0-alpha09'",
      },
    ],
  },
  {
    relativePath: join("@capacitor", "privacy-screen", "android", "build.gradle"),
    replacements: [
      {
        find: "classpath 'com.android.tools.build:gradle:8.13.0'",
        replace: "classpath 'com.android.tools.build:gradle:9.1.0-alpha09'",
      },
      {
        find:
          "apply plugin: 'com.android.library'\napply plugin: 'org.jetbrains.kotlin.android'",
        replace:
          "apply plugin: 'com.android.library'\nif (!extensions.findByName(\"kotlin\")) {\n    apply plugin: 'org.jetbrains.kotlin.android'\n}",
      },
      {
        find: "compileSdk = 36",
        replace:
          "compileSdk = project.hasProperty('compileSdkVersion') ? rootProject.ext.compileSdkVersion : 36",
      },
    ],
  },
  {
    relativePath: join("@capacitor", "background-runner", "android", "build.gradle"),
    replacements: [
      {
        find: "getDefaultProguardFile('proguard-android.txt')",
        replace: "getDefaultProguardFile('proguard-android-optimize.txt')",
      },
      {
        find: "classpath 'com.android.tools.build:gradle:8.13.0'",
        replace: "classpath 'com.android.tools.build:gradle:9.1.0-alpha09'",
      },
      {
        find:
          "apply plugin: 'com.android.library'\napply plugin: 'org.jetbrains.kotlin.android'",
        replace:
          "apply plugin: 'com.android.library'\nif (!extensions.findByName(\"kotlin\")) {\n    apply plugin: 'org.jetbrains.kotlin.android'\n}",
      },
      {
        find: "compileSdk = 36",
        replace:
          "compileSdk = project.hasProperty('compileSdkVersion') ? rootProject.ext.compileSdkVersion : 36",
      },
      {
        find: "implementation fileTree(dir: 'libs', include: ['*.jar'])",
        replace: "implementation fileTree(dir: 'libs', include: ['*.jar', '*.aar'])",
      },
      {
        find: 'implementation (name: "android-js-engine-release", ext: "aar")',
        replace: 'compileOnly (name: "android-js-engine-release", ext: "aar")',
      },
      {
        find: "implementation files('src/main/libs/android-js-engine-release.aar')",
        replace: 'compileOnly (name: "android-js-engine-release", ext: "aar")',
      },
    ],
  },
];

let modifiedAny = false;
let foundAny = false;

for (const patch of patches) {
  for (const nodeModulesRoot of NODE_MODULE_ROOTS) {
    const path = join(nodeModulesRoot, patch.relativePath);

    if (!existsSync(path)) {
      continue;
    }
    foundAny = true;

    let contents = readFileSync(path, "utf8");
    const original = contents;

    for (const { find, replace } of patch.replacements) {
      contents = contents.split(find).join(replace);
    }

    if (contents !== original) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, contents, "utf8");
      modifiedAny = true;
      console.log(`${LOG_PREFIX} patched ${path}`);
    }
  }
}

type FilePatch = {
  path: string;
  transform: (content: string) => string;
};

const projectFilePatches: FilePatch[] = [
  {
    path: join(ANDROID_ROOT, "app", "build.gradle"),
    transform: (content) => {
      let next = content;
      next = next.replace(
        /repositories\s*\{[\s\S]*?\}\s*\n\s*dependencies\s*\{/m,
        "repositories {\n    flatDir {\n        dirs '../capacitor-cordova-android-plugins/src/main/libs', 'libs'\n        dirs '../../node_modules/@capacitor/background-runner/android/src/main/libs', 'libs'\n    }\n}\n\ndependencies {"
      );
      next = next.replace(/implementation fileTree\(include: \['\*\.jar'(?:, '\*\.aar')?\], dir: 'libs'\)/, "implementation fileTree(include: ['*.jar', '*.aar'], dir: 'libs')");
      if (!next.includes("implementation(name: 'android-js-engine-release', ext: 'aar')")) {
        next = next.replace(
          "implementation fileTree(include: ['*.jar', '*.aar'], dir: 'libs')",
          "implementation fileTree(include: ['*.jar', '*.aar'], dir: 'libs')\n    implementation(name: 'android-js-engine-release', ext: 'aar')"
        );
      }
      return next;
    },
  },
  {
    path: join(ANDROID_ROOT, "capacitor-cordova-android-plugins", "build.gradle"),
    transform: (content) => {
      let next = content;
      next = next.replace(
        /repositories\s*\{\s*google\(\)\s*mavenCentral\(\)\s*flatDir\s*\{\s*dirs\s+'src\/main\/libs',\s*'libs'\s*\}\s*\}/m,
        "repositories {\n    google()\n    mavenCentral()\n}\n"
      );
      next = next.replace(
        "implementation fileTree(dir: 'src/main/libs', include: ['*.jar'])",
        "implementation fileTree(dir: 'src/main/libs', include: ['*.jar', '*.aar'])\n    implementation fileTree(dir: 'libs', include: ['*.jar', '*.aar'])"
      );
      return next;
    },
  },
];

for (const filePatch of projectFilePatches) {
  if (!existsSync(filePatch.path)) continue;
  foundAny = true;
  const original = readFileSync(filePatch.path, "utf8");
  const next = filePatch.transform(original);
  if (next !== original) {
    mkdirSync(dirname(filePatch.path), { recursive: true });
    writeFileSync(filePatch.path, next, "utf8");
    modifiedAny = true;
    console.log(`${LOG_PREFIX} patched ${filePatch.path}`);
  }
}

if (!modifiedAny) {
  if (!foundAny) {
    console.log(`${LOG_PREFIX} no target plugin files found in known node_modules locations.`);
  } else {
    console.log(`${LOG_PREFIX} no changes needed.`);
  }
}
