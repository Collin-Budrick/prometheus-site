import { resolveStaticAssetUrl } from './static-asset-url'

export const HOME_DEMO_WARM_CORE_ASSET_PATH =
  'build/static-shell/apps/site/src/static-shell/home-demo-warm-core.js'

export type HomeDemoWarmCoreModule = {
  warmStaticHomeDemoAssets: typeof import('./home-demo-warm-core').warmStaticHomeDemoAssets
}

type LoadHomeDemoWarmCoreOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomeDemoWarmCoreModule>
}

let homeDemoWarmCorePromise: Promise<HomeDemoWarmCoreModule> | null = null

const importHomeDemoWarmCore = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomeDemoWarmCoreModule

export const resolveHomeDemoWarmCoreUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_DEMO_WARM_CORE_ASSET_PATH, options)

export const loadHomeDemoWarmCore = ({
  assetUrl = resolveHomeDemoWarmCoreUrl(),
  importer = importHomeDemoWarmCore
}: LoadHomeDemoWarmCoreOptions = {}) => {
  if (!homeDemoWarmCorePromise) {
    homeDemoWarmCorePromise = importer(assetUrl)
  }
  return homeDemoWarmCorePromise
}

export const resetHomeDemoWarmCoreLoaderForTests = () => {
  homeDemoWarmCorePromise = null
}
