import sharedStyleHref from './home-demo-shared.css?url'
import {
  HOME_DEMO_RUNTIME_ASSET_PATHS,
  normalizeHomeDemoAssetMap,
  type HomeDemoAssetMap
} from './home-demo-runtime-types'

export const DEFAULT_HOME_DEMO_ASSETS: HomeDemoAssetMap = {
  planner: {
    moduleHref: HOME_DEMO_RUNTIME_ASSET_PATHS.planner,
    styleHref: sharedStyleHref
  },
  'wasm-renderer': {
    moduleHref: HOME_DEMO_RUNTIME_ASSET_PATHS['wasm-renderer'],
    styleHref: sharedStyleHref
  },
  'react-binary': {
    moduleHref: HOME_DEMO_RUNTIME_ASSET_PATHS['react-binary'],
    styleHref: sharedStyleHref
  },
  'preact-island': {
    moduleHref: HOME_DEMO_RUNTIME_ASSET_PATHS['preact-island'],
    styleHref: sharedStyleHref
  }
}

export const createHomeDemoAssetMap = (
  overrides?: Partial<HomeDemoAssetMap> | null
): HomeDemoAssetMap =>
  normalizeHomeDemoAssetMap({
    ...DEFAULT_HOME_DEMO_ASSETS,
    ...(overrides ?? {})
  })
