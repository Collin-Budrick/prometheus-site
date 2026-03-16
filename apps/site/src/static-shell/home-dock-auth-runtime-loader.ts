import { resolveStaticAssetUrl } from './static-asset-url'

const HOME_DOCK_AUTH_RUNTIME_ASSET_PATH =
  'build/static-shell/apps/site/src/static-shell/home-dock-auth-runtime.js'

export type HomeDockAuthRuntimeModule = {
  refreshHomeDockAuthIfNeeded: typeof import('./home-dock-auth-runtime').refreshHomeDockAuthIfNeeded
  syncHomeDockIfNeeded: typeof import('./home-dock-auth-runtime').syncHomeDockIfNeeded
}

type LoadHomeDockAuthRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomeDockAuthRuntimeModule>
}

let homeDockAuthRuntimePromise: Promise<HomeDockAuthRuntimeModule> | null = null

const importHomeDockAuthRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomeDockAuthRuntimeModule

export const resolveHomeDockAuthRuntimeUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_DOCK_AUTH_RUNTIME_ASSET_PATH, options)

export const loadHomeDockAuthRuntime = ({
  assetUrl = resolveHomeDockAuthRuntimeUrl(),
  importer = importHomeDockAuthRuntime
}: LoadHomeDockAuthRuntimeOptions = {}) => {
  if (!homeDockAuthRuntimePromise) {
    homeDockAuthRuntimePromise = importer(assetUrl)
  }
  return homeDockAuthRuntimePromise
}

export const resetHomeDockAuthRuntimeLoaderForTests = () => {
  homeDockAuthRuntimePromise = null
}
