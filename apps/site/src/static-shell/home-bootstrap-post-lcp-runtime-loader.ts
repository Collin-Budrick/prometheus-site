import { resolveStaticAssetUrl } from './static-asset-url'
import type {
  installHomeBootstrapPostLcpRuntime
} from './home-bootstrap-post-lcp-runtime'

const HOME_BOOTSTRAP_POST_LCP_RUNTIME_ASSET_PATH =
  'build/static-shell/apps/site/src/static-shell/home-bootstrap-post-lcp-runtime.js'

export type HomeBootstrapPostLcpRuntimeModule = {
  installHomeBootstrapPostLcpRuntime: typeof installHomeBootstrapPostLcpRuntime
}

type LoadHomeBootstrapPostLcpRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomeBootstrapPostLcpRuntimeModule>
}

let homeBootstrapPostLcpRuntimePromise: Promise<HomeBootstrapPostLcpRuntimeModule> | null = null

const importHomeBootstrapPostLcpRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomeBootstrapPostLcpRuntimeModule

export const resolveHomeBootstrapPostLcpRuntimeUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_BOOTSTRAP_POST_LCP_RUNTIME_ASSET_PATH, options)

export const loadHomeBootstrapPostLcpRuntime = ({
  assetUrl = resolveHomeBootstrapPostLcpRuntimeUrl(),
  importer = importHomeBootstrapPostLcpRuntime
}: LoadHomeBootstrapPostLcpRuntimeOptions = {}) => {
  if (!homeBootstrapPostLcpRuntimePromise) {
    homeBootstrapPostLcpRuntimePromise = importer(assetUrl)
  }
  return homeBootstrapPostLcpRuntimePromise
}

export const resetHomeBootstrapPostLcpRuntimeLoaderForTests = () => {
  homeBootstrapPostLcpRuntimePromise = null
}
