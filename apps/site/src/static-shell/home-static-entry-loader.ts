import { resolveStaticAssetUrl } from './static-asset-url'

export const HOME_STATIC_ANCHOR_ENTRY_ASSET_PATH =
  'build/static-shell/apps/site/src/static-shell/home-static-anchor-entry.js'
export const HOME_STATIC_ENTRY_ASSET_PATH =
  'build/static-shell/apps/site/src/static-shell/home-static-entry.js'

export type HomeStaticEntryRuntimeModule = {
  primeHomeSettingsInteraction?: typeof import('./home-static-entry').primeHomeSettingsInteraction
  waitForHomeStaticEntryInstallation?: typeof import('./home-static-entry').waitForHomeStaticEntryInstallation
}

type LoadHomeStaticEntryRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomeStaticEntryRuntimeModule>
}

let homeStaticEntryRuntimePromise: Promise<HomeStaticEntryRuntimeModule> | null = null

const importHomeStaticEntryRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomeStaticEntryRuntimeModule

export const resolveHomeStaticEntryRuntimeUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_STATIC_ENTRY_ASSET_PATH, options)

export const loadHomeStaticEntryRuntime = ({
  assetUrl = resolveHomeStaticEntryRuntimeUrl(),
  importer = importHomeStaticEntryRuntime
}: LoadHomeStaticEntryRuntimeOptions = {}) => {
  if (!homeStaticEntryRuntimePromise) {
    homeStaticEntryRuntimePromise = importer(assetUrl)
  }
  return homeStaticEntryRuntimePromise
}

export const resetHomeStaticEntryRuntimeLoaderForTests = () => {
  homeStaticEntryRuntimePromise = null
}
