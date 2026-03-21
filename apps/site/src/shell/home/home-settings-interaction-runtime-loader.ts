import { resolveStaticAssetUrl } from '../core/static-asset-url'

export const HOME_SETTINGS_INTERACTION_RUNTIME_ASSET_PATH =
  'build/static-shell/apps/site/src/shell/home/home-settings-interaction-runtime.js'

export type HomeSettingsInteractionRuntimeModule = {
  primeHomeSettingsInteraction: typeof import('./home-settings-interaction-runtime').primeHomeSettingsInteraction
}

type LoadHomeSettingsInteractionRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomeSettingsInteractionRuntimeModule>
}

let homeSettingsInteractionRuntimePromise:
  | Promise<HomeSettingsInteractionRuntimeModule>
  | null = null

const importHomeSettingsInteractionRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomeSettingsInteractionRuntimeModule

export const resolveHomeSettingsInteractionRuntimeUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_SETTINGS_INTERACTION_RUNTIME_ASSET_PATH, options)

export const loadHomeSettingsInteractionRuntime = ({
  assetUrl = resolveHomeSettingsInteractionRuntimeUrl(),
  importer = importHomeSettingsInteractionRuntime
}: LoadHomeSettingsInteractionRuntimeOptions = {}) => {
  if (!homeSettingsInteractionRuntimePromise) {
    homeSettingsInteractionRuntimePromise = importer(assetUrl)
  }
  return homeSettingsInteractionRuntimePromise
}

export const resetHomeSettingsInteractionRuntimeLoaderForTests = () => {
  homeSettingsInteractionRuntimePromise = null
}
