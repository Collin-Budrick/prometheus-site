import { resolveStaticAssetUrl } from './static-asset-url'

export const HOME_POST_ANCHOR_CORE_ASSET_PATH =
  'build/static-shell/apps/site/src/static-shell/home-post-anchor-core.js'

export type HomePostAnchorCoreModule = {
  installHomeStaticEntry: typeof import('./home-post-anchor-core').installHomeStaticEntry
  primeHomeSettingsInteraction: typeof import('./home-post-anchor-core').primeHomeSettingsInteraction
}

type LoadHomePostAnchorCoreOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomePostAnchorCoreModule>
}

let homePostAnchorCorePromise: Promise<HomePostAnchorCoreModule> | null = null

const importHomePostAnchorCore = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomePostAnchorCoreModule

export const resolveHomePostAnchorCoreUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_POST_ANCHOR_CORE_ASSET_PATH, options)

export const loadHomePostAnchorCore = ({
  assetUrl = resolveHomePostAnchorCoreUrl(),
  importer = importHomePostAnchorCore
}: LoadHomePostAnchorCoreOptions = {}) => {
  if (!homePostAnchorCorePromise) {
    homePostAnchorCorePromise = importer(assetUrl)
  }
  return homePostAnchorCorePromise
}

export const resetHomePostAnchorCoreLoaderForTests = () => {
  homePostAnchorCorePromise = null
}
