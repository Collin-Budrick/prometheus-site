#!/usr/bin/env bun

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = process.cwd();
const LOG_PREFIX = "[capacitor-android-patches]";
const NODE_MODULE_ROOTS = [join(ROOT, "node_modules"), join(ROOT, "apps", "site", "node_modules")];

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
          "apply plugin: 'org.jetbrains.kotlin.android'",
        replace:
          "if (!extensions.findByName(\"kotlin\")) {\n    apply plugin: 'org.jetbrains.kotlin.android'\n}",
      },
      {
        find: "compileSdk = 36",
        replace:
          "compileSdk = project.hasProperty('compileSdkVersion') ? rootProject.ext.compileSdkVersion : 36",
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

if (!modifiedAny) {
  if (!foundAny) {
    console.log(`${LOG_PREFIX} no target plugin files found in known node_modules locations.`);
  } else {
    console.log(`${LOG_PREFIX} no changes needed.`);
  }
}
