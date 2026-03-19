import { resolveStaticAssetUrl } from './static-asset-url'

export const HOME_ANCHOR_CORE_ASSET_PATH =
  'build/static-shell/apps/site/src/static-shell/home-anchor-core.js'

export type InstallHomeStaticAnchorEntry = (
  options?: Record<string, unknown>
) => (() => void) | undefined

export type HomeAnchorCoreModule = {
  bootstrapStaticHome: () => Promise<void>
  installHomeStaticAnchorEntry: InstallHomeStaticAnchorEntry
}

type LoadHomeAnchorCoreOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomeAnchorCoreModule>
}

let homeAnchorCorePromise: Promise<HomeAnchorCoreModule> | null = null

const importHomeAnchorCore = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomeAnchorCoreModule

export const resolveHomeAnchorCoreUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_ANCHOR_CORE_ASSET_PATH, options)

export const loadHomeAnchorCore = ({
  assetUrl = resolveHomeAnchorCoreUrl(),
  importer = importHomeAnchorCore
}: LoadHomeAnchorCoreOptions = {}) => {
  if (!homeAnchorCorePromise) {
    homeAnchorCorePromise = importer(assetUrl)
  }
  return homeAnchorCorePromise
}

export const resetHomeAnchorCoreLoaderForTests = () => {
  homeAnchorCorePromise = null
}
