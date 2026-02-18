import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const env = { ...process.env };
const tauriRoot = process.cwd();
const siteRoot = join(tauriRoot, "../site");
const workspaceRoot = join(tauriRoot, "../..");
const isDevCommand = args.includes("dev");

const resolveTauriConfig = () => {
  const raw = env.TAURI_CONFIG?.trim();
  if (!raw) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // keep behavior deterministic even if TAURI_CONFIG was invalid JSON
  }
  return {} as Record<string, unknown>;
};

const overrideDevUrl = env.PROMETHEUS_TAURI_DEV_URL?.trim();
if (isDevCommand && overrideDevUrl) {
  const tauriConfig = resolveTauriConfig();
  const build =
    tauriConfig.build && typeof tauriConfig.build === "object" && !Array.isArray(tauriConfig.build)
      ? (tauriConfig.build as Record<string, unknown>)
      : {};

  env.TAURI_CONFIG = JSON.stringify({
    ...tauriConfig,
    build: {
      ...build,
      devUrl: overrideDevUrl,
    },
  });
  console.info(`[tauri] Using devUrl override: ${overrideDevUrl}`);
}

const ensureSiteTauriClientDeps = () => {
  if (process.platform !== "win32") return;

  const siteRequire = createRequire(join(siteRoot, "package.json"));
  try {
    siteRequire.resolve("@tauri-apps/plugin-deep-link");
    siteRequire.resolve("@tauri-apps/plugin-shell");
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
  ["x", "--bun", "@tauri-apps/cli", ...args],
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
