import { resolveStaticAssetUrl } from '../core/static-asset-url'

const HOME_UI_CONTROLS_RUNTIME_ASSET_PATH =
  'build/static-shell/apps/site/src/shell/home/home-ui-controls-runtime.js'

export type HomeUiControlsRuntimeModule = {
  bindHomeUiControls: typeof import('./home-ui-controls-runtime').bindHomeUiControls
}

type LoadHomeUiControlsRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomeUiControlsRuntimeModule>
}

let homeUiControlsRuntimePromise: Promise<HomeUiControlsRuntimeModule> | null = null

const importHomeUiControlsRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomeUiControlsRuntimeModule

export const resolveHomeUiControlsRuntimeUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_UI_CONTROLS_RUNTIME_ASSET_PATH, options)

export const loadHomeUiControlsRuntime = ({
  assetUrl = resolveHomeUiControlsRuntimeUrl(),
  importer = importHomeUiControlsRuntime
}: LoadHomeUiControlsRuntimeOptions = {}) => {
  if (!homeUiControlsRuntimePromise) {
    homeUiControlsRuntimePromise = importer(assetUrl)
  }
  return homeUiControlsRuntimePromise
}

export const resetHomeUiControlsRuntimeLoaderForTests = () => {
  homeUiControlsRuntimePromise = null
}
