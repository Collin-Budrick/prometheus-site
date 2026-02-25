import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
const isAndroidStudioScript = args.includes("android-studio-script");
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

const commandExecutableName = (command: string) => `${command}${process.platform === "win32" ? ".exe" : ""}`;

const hasCommand = (command: string) => {
  const separator = process.platform === "win32" ? ";" : ":";
  const executable = commandExecutableName(command);
  const pathEntries = (env.PATH || "").split(separator).filter(Boolean);
  if (pathEntries.some((entry) => existsSync(join(entry, executable)))) return true;

  const probe = spawnSync(command, ["--version"], { encoding: "utf8", stdio: "ignore" });
  return !probe.error;
};

const ensureBunOnPath = () => {
  if (hasCommand("bun")) return;

  const separator = process.platform === "win32" ? ";" : ":";
  const bunBinDir = dirname(process.execPath);
  const currentPath = (env.PATH || "").split(separator).filter(Boolean);
  if (!currentPath.some((entry) => entry.toLowerCase() === bunBinDir.toLowerCase())) {
    env.PATH = `${bunBinDir}${separator}${env.PATH || ""}`;
  }

  if (!hasCommand("bun")) {
    console.error(
      "[tauri] Could not resolve 'bun' for spawned child commands. Install Bun and ensure it is on PATH."
    );
    process.exit(1);
  }
};

const resolveCargoBinaryFromHome = (home: string | undefined) => {
  if (!home) return undefined;
  const binDir = join(home, "bin");
  const candidate = join(binDir, process.platform === "win32" ? "cargo.exe" : "cargo");
  return existsSync(candidate) ? candidate : undefined;
};

const ensureCargoAvailable = () => {
  if (hasCommand("cargo")) return;

  const separator = process.platform === "win32" ? ";" : ":";
  const candidateHomes = [
    env.CARGO_HOME?.trim(),
    process.env.USERPROFILE && join(process.env.USERPROFILE, ".cargo"),
    process.env.HOME && join(process.env.HOME, ".cargo"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Programs", "Rust"),
  ];

  for (const home of candidateHomes) {
    const normalized = home?.trim();
    if (!normalized) continue;
    const binary = resolveCargoBinaryFromHome(normalized);
    if (!binary) continue;

    const binDir = join(normalized, "bin");
    const currentPath = (env.PATH || "").split(separator).filter(Boolean);
    if (!currentPath.some((entry) => entry.toLowerCase() === binDir.toLowerCase())) {
      env.PATH = `${binDir}${separator}${env.PATH || ""}`;
    }
    env.CARGO_HOME = normalized;
    console.info(`[tauri] Found Cargo at ${binary}. Added ${binDir} to PATH for this run.`);
    return;
  }

  console.error(
    "[tauri] Missing 'cargo'. Install Rust (https://rustup.rs/) and ensure cargo is on PATH, " +
      "or set CARGO_HOME to a directory containing `.cargo/bin/cargo` before running Tauri."
  );
  process.exit(1);
};

const requiresCargo =
  cliArgs.includes("dev") || cliArgs.includes("build") || isAndroidTarget || isIosTarget || cliArgs.includes("android-studio-script");
if (requiresCargo) {
  ensureCargoAvailable();
  ensureBunOnPath();
}

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

const parseHostFromUrl = (value: string | undefined) => {
  const raw = value?.trim();
  if (!raw) return "";
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return "";
  }
};

const shellCommandForBun = (suffix: string) => {
  const executable = process.execPath.includes(" ")
    ? JSON.stringify(process.execPath)
    : process.execPath;
  return `${executable} ${suffix}`;
};

const explicitProfile = normalizeProfile(env.PROMETHEUS_TAURI_PROFILE);
const tauriProfile = explicitProfile === "prod" || explicitProfile === "dev"
  ? explicitProfile
  : isBuildCommand
    ? "prod"
    : "dev";
const profileConfigFile = tauriProfile === "prod" ? "tauri.conf.prod.json" : "tauri.conf.dev.json";

let generatedConfig = deepMerge(readJsonConfig("tauri.conf.base.json"), readJsonConfig(profileConfigFile));
const resolvedBuild = isRecord(generatedConfig.build) ? generatedConfig.build : {};
const currentBeforeDevCommand = typeof resolvedBuild.beforeDevCommand === "string" ? resolvedBuild.beforeDevCommand : undefined;
const currentBeforeBuildCommand = typeof resolvedBuild.beforeBuildCommand === "string" ? resolvedBuild.beforeBuildCommand : undefined;

if (currentBeforeDevCommand && /\bbun\b/.test(currentBeforeDevCommand)) {
  generatedConfig = deepMerge(generatedConfig, {
    build: {
      beforeDevCommand: shellCommandForBun("--cwd ../site dev --port 4173"),
    },
  });
}

if (currentBeforeBuildCommand && /\bbun\b/.test(currentBeforeBuildCommand)) {
  generatedConfig = deepMerge(generatedConfig, {
    build: {
      beforeBuildCommand: shellCommandForBun("--cwd ../site build:tauri"),
    },
  });
}

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
const explicitOverrideDevUrl = env.PROMETHEUS_TAURI_DEV_URL?.trim();
let effectiveDevUrl = explicitOverrideDevUrl || "";
const isAndroidDevFlow = tauriTarget === "android" && (isDevCommand || isAndroidStudioScript);
if (!effectiveDevUrl && isAndroidDevFlow) {
  const build = isRecord(generatedConfig.build) ? generatedConfig.build : {};
  const currentDevUrl = typeof build.devUrl === "string" ? build.devUrl : "";
  const currentHost = parseHostFromUrl(currentDevUrl);
  const shouldRewriteAndroidDevUrl =
    !currentHost || currentHost === "prometheus.dev" || currentHost === "prometheus.prod";
  if (shouldRewriteAndroidDevUrl) {
    const rawHost = (env.TAURI_DEV_HOST || env.PROMETHEUS_DEVICE_HOST || "").trim();
    const disabledHost = new Set(["0", "off", "false", "disabled", "none"]);
    const host = rawHost && !disabledHost.has(rawHost.toLowerCase()) ? rawHost : "10.0.2.2";
    const port = (env.PROMETHEUS_DEVICE_WEB_PORT || "4173").trim() || "4173";
    effectiveDevUrl = `http://${host}:${port}`;
  }
}
if (effectiveDevUrl && (isDevCommand || isAndroidStudioScript)) {
  const build = isRecord(generatedConfig.build) ? generatedConfig.build : {};
  generatedConfig = deepMerge(generatedConfig, {
    build: {
      ...build,
      devUrl: effectiveDevUrl,
    },
  });
}
env.TAURI_CONFIG = JSON.stringify(generatedConfig);
console.info(`[tauri] profile=${tauriProfile} target=${tauriTarget}`);
if (effectiveDevUrl && (isDevCommand || isAndroidStudioScript)) {
  console.info(`[tauri] Using devUrl override: ${effectiveDevUrl}`);
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
