import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type StaticShellChunkManifest = {
  assets: string[];
  entryImports: Record<string, string[]>;
  preloadImports?: Record<string, string[]>;
};

const EMPTY_MANIFEST: StaticShellChunkManifest = {
  assets: [],
  entryImports: {},
};

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
          entryImports:
          parsed.entryImports && typeof parsed.entryImports === "object"
            ? Object.fromEntries(
                Object.entries(parsed.entryImports).map(([entryPath, imports]) => [
                  entryPath,
                  Array.isArray(imports)
                    ? imports.filter((value): value is string => typeof value === "string")
                    : [],
                ]),
              )
            : {},
          preloadImports:
            parsed.preloadImports && typeof parsed.preloadImports === "object"
              ? Object.fromEntries(
                  Object.entries(parsed.preloadImports).map(([entryPath, imports]) => [
                    entryPath,
                    Array.isArray(imports)
                      ? imports.filter((value): value is string => typeof value === "string")
                      : [],
                  ]),
                )
              : {},
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

export const expandStaticShellPreloadPaths = (paths: readonly string[]) =>
  Array.from(
    new Set(
      paths.flatMap((assetPath) => [
        assetPath,
        ...(STATIC_SHELL_CHUNK_MANIFEST.preloadImports?.[assetPath] ??
          STATIC_SHELL_CHUNK_MANIFEST.entryImports[assetPath] ??
          []),
      ]),
    ),
  );
