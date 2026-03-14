import { resolveStaticAssetUrl } from './static-asset-url'

const ISLAND_BOOTSTRAP_RUNTIME_ASSET_PATH =
  'build/static-shell/apps/site/src/static-shell/island-bootstrap-runtime.js'

export type IslandBootstrapRuntimeModule = {
  bootstrapStaticIslandShell: () => Promise<void>
}

type LoadIslandBootstrapRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<IslandBootstrapRuntimeModule>
}

let islandBootstrapRuntimePromise: Promise<IslandBootstrapRuntimeModule> | null = null

const importIslandBootstrapRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as IslandBootstrapRuntimeModule

export const resolveIslandBootstrapRuntimeUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(ISLAND_BOOTSTRAP_RUNTIME_ASSET_PATH, options)

export const loadIslandBootstrapRuntime = ({
  assetUrl = resolveIslandBootstrapRuntimeUrl(),
  importer = importIslandBootstrapRuntime
}: LoadIslandBootstrapRuntimeOptions = {}) => {
  if (!islandBootstrapRuntimePromise) {
    islandBootstrapRuntimePromise = importer(assetUrl)
  }
  return islandBootstrapRuntimePromise
}

export const resetIslandBootstrapRuntimeLoaderForTests = () => {
  islandBootstrapRuntimePromise = null
}
