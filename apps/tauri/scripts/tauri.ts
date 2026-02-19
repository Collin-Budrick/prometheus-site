import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const env = { ...process.env };
const cliArgs = [...args];
const tauriRoot = process.cwd();
const siteRoot = join(tauriRoot, "../site");
const workspaceRoot = join(tauriRoot, "../..");
const srcTauriRoot = join(tauriRoot, "src-tauri");
const isDevCommand = args.includes("dev");
const isBuildCommand = args.includes("build");
const isAndroidTarget = args.includes("android");
const isIosTarget = args.includes("ios");
const tauriTarget = isAndroidTarget ? "android" : isIosTarget ? "ios" : "desktop";

type JsonRecord = Record<string, unknown>;

const resolveTauriConfig = () => {
  const raw = env.TAURI_CONFIG?.trim();
  if (!raw) return {} as JsonRecord;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as JsonRecord;
    }
  } catch {
    // keep behavior deterministic even if TAURI_CONFIG was invalid JSON
  }
  return {} as JsonRecord;
};

const readJsonConfig = (fileName: string): JsonRecord => {
  const fullPath = join(srcTauriRoot, fileName);
  const raw = readFileSync(fullPath, "utf8");
  const parsed = JSON.parse(raw);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as JsonRecord;
  }
  throw new Error(`[tauri] Invalid config shape in ${fullPath}`);
};

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const deepMerge = (base: JsonRecord, overlay: JsonRecord): JsonRecord => {
  const output: JsonRecord = { ...base };
  for (const [key, overlayValue] of Object.entries(overlay)) {
    const baseValue = output[key];
    if (Array.isArray(overlayValue)) {
      output[key] = [...overlayValue];
      continue;
    }
    if (isRecord(baseValue) && isRecord(overlayValue)) {
      output[key] = deepMerge(baseValue, overlayValue);
      continue;
    }
    output[key] = overlayValue;
  }
  return output;
};

const parseList = (raw: string | undefined) =>
  (raw ?? "")
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const isLocalApiBase = (value: string) => {
  if (!value) return true;
  if (value.startsWith("/")) return true;
  return value.includes("localhost") || value.includes("127.0.0.1");
};

const normalizeProfile = (value: string | undefined) => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "production") return "prod";
  if (normalized === "development") return "dev";
  return normalized;
};

const explicitProfile = normalizeProfile(env.PROMETHEUS_TAURI_PROFILE);
const tauriProfile = explicitProfile === "prod" || explicitProfile === "dev"
  ? explicitProfile
  : isBuildCommand
    ? "prod"
    : "dev";
const profileConfigFile = tauriProfile === "prod" ? "tauri.conf.prod.json" : "tauri.conf.dev.json";

let generatedConfig = deepMerge(readJsonConfig("tauri.conf.base.json"), readJsonConfig(profileConfigFile));

if (tauriProfile === "prod" && isBuildCommand) {
  const rawApiBase = (env.VITE_API_BASE ?? "").trim();
  if (!rawApiBase || isLocalApiBase(rawApiBase)) {
    console.error(
      `[tauri] Refusing production build with local API base: '${rawApiBase || "<empty>"}'. ` +
      "Set VITE_API_BASE to an absolute remote HTTPS API URL."
    );
    process.exit(1);
  }
}

const overrideDevUrl = env.PROMETHEUS_TAURI_DEV_URL?.trim();
if (isDevCommand && overrideDevUrl) {
  const build = isRecord(generatedConfig.build) ? generatedConfig.build : {};
  generatedConfig = deepMerge(generatedConfig, {
    build: {
      ...build,
      devUrl: overrideDevUrl,
    },
  });
}

const skipBeforeDevCommand =
  isDevCommand && env.PROMETHEUS_TAURI_SKIP_BEFORE_DEV_COMMAND?.trim() === "1";
if (skipBeforeDevCommand) {
  const build = isRecord(generatedConfig.build) ? { ...generatedConfig.build } : {};
  const noopBeforeDevCommand = process.platform === "win32" ? "cmd /c exit 0" : "true";
  generatedConfig = deepMerge(generatedConfig, { build });
  generatedConfig = deepMerge(generatedConfig, {
    build: {
      ...build,
      beforeDevCommand: noopBeforeDevCommand,
    },
  });
  cliArgs.push(
    "--config",
    JSON.stringify({
      build: {
        beforeDevCommand: noopBeforeDevCommand,
      },
    }),
  );
  console.info("[tauri] Reusing existing dev server; skipping beforeDevCommand.");
}

if (tauriProfile === "prod") {
  const endpoints = parseList(env.PROMETHEUS_TAURI_UPDATER_ENDPOINTS);
  const defaultEndpoint =
    "https://github.com/prometheus-site/prometheus-site/releases/latest/download/latest.json";
  const pubkey = env.PROMETHEUS_TAURI_UPDATER_PUBKEY?.trim() ?? "";
  const mobileBuild = tauriTarget === "android" || tauriTarget === "ios";

  if (!mobileBuild) {
    if (!pubkey) {
      console.error(
        "[tauri] PROMETHEUS_TAURI_UPDATER_PUBKEY is required for production desktop builds."
      );
      process.exit(1);
    }
    generatedConfig = deepMerge(generatedConfig, {
      plugins: {
        updater: {
          active: true,
          endpoints: endpoints.length > 0 ? endpoints : [defaultEndpoint],
          pubkey,
        },
      },
    });
  } else {
    generatedConfig = deepMerge(generatedConfig, {
      plugins: {
        updater: {
          active: false,
        },
      },
    });
  }
}

generatedConfig = deepMerge(generatedConfig, resolveTauriConfig());
env.TAURI_CONFIG = JSON.stringify(generatedConfig);
console.info(`[tauri] profile=${tauriProfile} target=${tauriTarget}`);
if (isDevCommand && overrideDevUrl) {
  console.info(`[tauri] Using devUrl override: ${overrideDevUrl}`);
}

const ensureSiteTauriClientDeps = () => {
  if (process.platform !== "win32") return;

  const siteRequire = createRequire(join(siteRoot, "package.json"));
  try {
    siteRequire.resolve("@tauri-apps/api");
    siteRequire.resolve("@tauri-apps/plugin-deep-link");
    siteRequire.resolve("@tauri-apps/plugin-shell");
    siteRequire.resolve("@tauri-apps/plugin-dialog");
    siteRequire.resolve("@tauri-apps/plugin-notification");
    siteRequire.resolve("@tauri-apps/plugin-updater");
    siteRequire.resolve("@tauri-apps/plugin-global-shortcut");
    siteRequire.resolve("@tauri-apps/plugin-fs");
    siteRequire.resolve("@tauri-apps/plugin-sql");
    return;
  } catch {
    const install = spawnSync(process.execPath, ["install"], {
      cwd: workspaceRoot,
      env,
      stdio: "inherit",
    });

    if (install.error) {
      throw install.error;
    }

    if (typeof install.status === "number" && install.status !== 0) {
      process.exit(install.status);
    }
  }
};

ensureSiteTauriClientDeps();

if (process.platform === "win32" && !env.CARGO_TARGET_DIR) {
  const localAppData = env.LOCALAPPDATA;
  if (localAppData) {
    env.CARGO_TARGET_DIR = join(
      localAppData,
      "prometheus-site",
      "tauri-target",
    );
    mkdirSync(env.CARGO_TARGET_DIR, { recursive: true });
  }
}

const child = spawn(
  process.execPath,
  ["x", "--bun", "@tauri-apps/cli", ...cliArgs],
  {
    cwd: tauriRoot,
    env,
    stdio: "inherit",
  },
);

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
