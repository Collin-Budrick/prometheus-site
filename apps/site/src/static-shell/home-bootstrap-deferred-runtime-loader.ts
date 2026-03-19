import { resolveStaticAssetUrl } from './static-asset-url'

export const HOME_BOOTSTRAP_DEFERRED_RUNTIME_ASSET_PATH =
  'build/static-shell/apps/site/src/static-shell/home-bootstrap-deferred-runtime.js'

export type HomeBootstrapDeferredRuntimeModule = {
  installHomeBootstrapDeferredRuntime: typeof import('./home-bootstrap-deferred-runtime').installHomeBootstrapDeferredRuntime
}

type LoadHomeBootstrapDeferredRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomeBootstrapDeferredRuntimeModule>
}

let homeBootstrapDeferredRuntimePromise: Promise<HomeBootstrapDeferredRuntimeModule> | null = null

const importHomeBootstrapDeferredRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomeBootstrapDeferredRuntimeModule

export const resolveHomeBootstrapDeferredRuntimeUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_BOOTSTRAP_DEFERRED_RUNTIME_ASSET_PATH, options)

export const loadHomeBootstrapDeferredRuntime = ({
  assetUrl = resolveHomeBootstrapDeferredRuntimeUrl(),
  importer = importHomeBootstrapDeferredRuntime
}: LoadHomeBootstrapDeferredRuntimeOptions = {}) => {
  if (!homeBootstrapDeferredRuntimePromise) {
    homeBootstrapDeferredRuntimePromise = importer(assetUrl)
  }
  return homeBootstrapDeferredRuntimePromise
}

export const resetHomeBootstrapDeferredRuntimeLoaderForTests = () => {
  homeBootstrapDeferredRuntimePromise = null
}
