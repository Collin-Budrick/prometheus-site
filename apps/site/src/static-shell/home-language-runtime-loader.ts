import { resolveStaticAssetUrl } from './static-asset-url'

const HOME_LANGUAGE_RUNTIME_ASSET_PATH =
  'build/static-shell/apps/site/src/static-shell/home-language-runtime.js'

export type HomeLanguageRuntimeModule = {
  restorePreferredStaticHomeLanguage: typeof import('./home-language-runtime').restorePreferredStaticHomeLanguage
  swapStaticHomeLanguage: typeof import('./home-language-runtime').swapStaticHomeLanguage
}

type LoadHomeLanguageRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomeLanguageRuntimeModule>
}

let homeLanguageRuntimePromise: Promise<HomeLanguageRuntimeModule> | null = null

const importHomeLanguageRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomeLanguageRuntimeModule

export const resolveHomeLanguageRuntimeUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_LANGUAGE_RUNTIME_ASSET_PATH, options)

export const loadHomeLanguageRuntime = ({
  assetUrl = resolveHomeLanguageRuntimeUrl(),
  importer = importHomeLanguageRuntime
}: LoadHomeLanguageRuntimeOptions = {}) => {
  if (!homeLanguageRuntimePromise) {
    homeLanguageRuntimePromise = importer(assetUrl)
  }
  return homeLanguageRuntimePromise
}

export const resetHomeLanguageRuntimeLoaderForTests = () => {
  homeLanguageRuntimePromise = null
}
