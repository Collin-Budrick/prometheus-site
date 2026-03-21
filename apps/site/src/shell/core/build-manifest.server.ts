import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type StaticShellChunkManifest = {
  assets: string[];
  entryImports: Record<string, string[]>;
  preloadImports?: Record<string, string[]>;
  anchorCoreImports?: Record<string, string[]>;
  postAnchorCoreImports?: Record<string, string[]>;
  demoWarmCoreImports?: Record<string, string[]>;
};

const EMPTY_MANIFEST: StaticShellChunkManifest = {
  assets: [],
  entryImports: {},
  preloadImports: {},
  anchorCoreImports: {},
  postAnchorCoreImports: {},
  demoWarmCoreImports: {},
};

const readStringArrayMap = (value: unknown) =>
  value && typeof value === "object"
    ? Object.fromEntries(
        Object.entries(value).map(([entryPath, imports]) => [
          entryPath,
          Array.isArray(imports)
            ? imports.filter((item): item is string => typeof item === "string")
            : [],
        ]),
      )
    : {};

const resolveChunkManifestCandidates = () => [
  path.resolve(process.cwd(), "dist", "build", "static-shell", "chunk-manifest.json"),
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../dist/build/static-shell/chunk-manifest.json",
  ),
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../dist/build/static-shell/chunk-manifest.json",
  ),
];

const STATIC_SHELL_CHUNK_MANIFEST = (() => {
  for (const filePath of resolveChunkManifestCandidates()) {
    if (!existsSync(filePath)) {
      continue;
    }
    try {
      const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Partial<StaticShellChunkManifest>;
        return {
          assets: Array.isArray(parsed.assets)
            ? parsed.assets.filter((value): value is string => typeof value === "string")
            : [],
          entryImports: readStringArrayMap(parsed.entryImports),
          preloadImports: readStringArrayMap(parsed.preloadImports),
          anchorCoreImports: readStringArrayMap(parsed.anchorCoreImports),
          postAnchorCoreImports: readStringArrayMap(parsed.postAnchorCoreImports),
          demoWarmCoreImports: readStringArrayMap(parsed.demoWarmCoreImports),
        };
    } catch {
      // Fall back to the empty manifest.
    }
  }

  return EMPTY_MANIFEST;
})();

export const getStaticShellChunkManifest = () => STATIC_SHELL_CHUNK_MANIFEST;

export const getStaticShellBuildAssetPaths = () =>
  STATIC_SHELL_CHUNK_MANIFEST.assets;

const expandStaticShellPaths = (
  paths: readonly string[],
  manifestKey:
    | "anchorCoreImports"
    | "postAnchorCoreImports"
    | "demoWarmCoreImports"
    | "preloadImports",
) =>
  Array.from(
    new Set(
      paths.flatMap((assetPath) => [
        assetPath,
        ...(STATIC_SHELL_CHUNK_MANIFEST[manifestKey]?.[assetPath] ??
          STATIC_SHELL_CHUNK_MANIFEST.entryImports[assetPath] ??
          []),
      ]),
    ),
  );

export const expandStaticShellPreloadPaths = (paths: readonly string[]) =>
  expandStaticShellPaths(paths, "anchorCoreImports");

export const expandStaticShellPostAnchorHintPaths = (paths: readonly string[]) =>
  expandStaticShellPaths(paths, "postAnchorCoreImports");

export const expandStaticShellDemoWarmHintPaths = (paths: readonly string[]) =>
  expandStaticShellPaths(paths, "demoWarmCoreImports");
