import { resolveStaticAssetUrl } from './static-asset-url'

export const HOME_POST_ANCHOR_LIFECYCLE_RUNTIME_ASSET_PATH =
  'build/static-shell/apps/site/src/static-shell/home-post-anchor-lifecycle-runtime.js'

export type HomePostAnchorLifecycleRuntimeModule = {
  installHomePostAnchorLifecycleRuntime: typeof import('./home-post-anchor-lifecycle-runtime').installHomePostAnchorLifecycleRuntime
}

type LoadHomePostAnchorLifecycleRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomePostAnchorLifecycleRuntimeModule>
}

let homePostAnchorLifecycleRuntimePromise: Promise<HomePostAnchorLifecycleRuntimeModule> | null =
  null

const importHomePostAnchorLifecycleRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomePostAnchorLifecycleRuntimeModule

export const resolveHomePostAnchorLifecycleRuntimeUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_POST_ANCHOR_LIFECYCLE_RUNTIME_ASSET_PATH, options)

export const loadHomePostAnchorLifecycleRuntime = ({
  assetUrl = resolveHomePostAnchorLifecycleRuntimeUrl(),
  importer = importHomePostAnchorLifecycleRuntime
}: LoadHomePostAnchorLifecycleRuntimeOptions = {}) => {
  if (!homePostAnchorLifecycleRuntimePromise) {
    homePostAnchorLifecycleRuntimePromise = importer(assetUrl)
  }
  return homePostAnchorLifecycleRuntimePromise
}

export const resetHomePostAnchorLifecycleRuntimeLoaderForTests = () => {
  homePostAnchorLifecycleRuntimePromise = null
}
