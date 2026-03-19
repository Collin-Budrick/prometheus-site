import { resolveStaticAssetUrl } from './static-asset-url'

export const HOME_STATIC_ENTRY_DEMO_WARMUP_ASSET_PATH =
  'build/static-shell/apps/site/src/static-shell/home-static-entry-demo-warmup.js'

export type HomeStaticEntryDemoWarmupModule = {
  warmStaticHomeDemoAssets: typeof import('./home-static-entry-demo-warmup').warmStaticHomeDemoAssets
}

type LoadHomeStaticEntryDemoWarmupOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomeStaticEntryDemoWarmupModule>
}

let homeStaticEntryDemoWarmupPromise: Promise<HomeStaticEntryDemoWarmupModule> | null = null

const importHomeStaticEntryDemoWarmup = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomeStaticEntryDemoWarmupModule

export const resolveHomeStaticEntryDemoWarmupUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_STATIC_ENTRY_DEMO_WARMUP_ASSET_PATH, options)

export const loadHomeStaticEntryDemoWarmup = ({
  assetUrl = resolveHomeStaticEntryDemoWarmupUrl(),
  importer = importHomeStaticEntryDemoWarmup
}: LoadHomeStaticEntryDemoWarmupOptions = {}) => {
  if (!homeStaticEntryDemoWarmupPromise) {
    homeStaticEntryDemoWarmupPromise = importer(assetUrl)
  }
  return homeStaticEntryDemoWarmupPromise
}

export const resetHomeStaticEntryDemoWarmupLoaderForTests = () => {
  homeStaticEntryDemoWarmupPromise = null
}
