#!/usr/bin/env bun

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = process.cwd();
const LOG_PREFIX = "[capacitor-android-patches]";

const patches: Array<{ path: string; replacements: Array<{ find: string; replace: string }> }> = [
  {
    path: join(ROOT, "node_modules", "@capacitor", "haptics", "android", "build.gradle"),
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
    path: join(ROOT, "node_modules", "@capacitor", "keyboard", "android", "build.gradle"),
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
    path: join(ROOT, "node_modules", "@capacitor", "privacy-screen", "android", "build.gradle"),
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

for (const patch of patches) {
  const path = patch.path;

  if (!existsSync(path)) {
    console.log(`${LOG_PREFIX} skipping missing file: ${path}`);
    continue;
  }

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

if (!modifiedAny) {
  console.log(`${LOG_PREFIX} no changes needed.`);
}
