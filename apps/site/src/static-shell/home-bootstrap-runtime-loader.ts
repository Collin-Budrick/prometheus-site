import { resolveStaticAssetUrl } from './static-asset-url'

const HOME_BOOTSTRAP_RUNTIME_ASSET_PATH =
  'build/static-shell/apps/site/src/static-shell/home-bootstrap-core-runtime.js'

export type HomeBootstrapRuntimeModule = {
  bootstrapStaticHome: () => Promise<void>
}

type LoadHomeBootstrapRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomeBootstrapRuntimeModule>
}

let homeBootstrapRuntimePromise: Promise<HomeBootstrapRuntimeModule> | null = null

const importHomeBootstrapRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomeBootstrapRuntimeModule

export const resolveHomeBootstrapRuntimeUrl = (options?: Parameters<typeof resolveStaticAssetUrl>[1]) =>
  resolveStaticAssetUrl(HOME_BOOTSTRAP_RUNTIME_ASSET_PATH, options)

export const loadHomeBootstrapRuntime = ({
  assetUrl = resolveHomeBootstrapRuntimeUrl(),
  importer = importHomeBootstrapRuntime
}: LoadHomeBootstrapRuntimeOptions = {}) => {
  if (!homeBootstrapRuntimePromise) {
    homeBootstrapRuntimePromise = importer(assetUrl)
  }
  return homeBootstrapRuntimePromise
}

export const resetHomeBootstrapRuntimeLoaderForTests = () => {
  homeBootstrapRuntimePromise = null
}
