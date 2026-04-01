import {
  HOME_DEMO_RUNTIME_ASSET_PATHS,
  normalizeHomeDemoAssetMap,
  type HomeDemoAssetMap
} from './home-demo-runtime-types'
import { resolveHomeDemoSharedStylesheetHref } from './home-demo-style-assets'

const defaultSharedStyleHref = resolveHomeDemoSharedStylesheetHref()

export const DEFAULT_HOME_DEMO_ASSETS: HomeDemoAssetMap = {
  planner: {
    moduleHref: HOME_DEMO_RUNTIME_ASSET_PATHS.planner,
    styleHref: defaultSharedStyleHref
  },
  'wasm-renderer': {
    moduleHref: HOME_DEMO_RUNTIME_ASSET_PATHS['wasm-renderer'],
    styleHref: defaultSharedStyleHref
  },
  'react-binary': {
    moduleHref: HOME_DEMO_RUNTIME_ASSET_PATHS['react-binary'],
    styleHref: defaultSharedStyleHref
  },
  'preact-island': {
    moduleHref: HOME_DEMO_RUNTIME_ASSET_PATHS['preact-island'],
    styleHref: defaultSharedStyleHref
  }
}

export const createHomeDemoAssetMap = (
  overrides?: Partial<HomeDemoAssetMap> | null
): HomeDemoAssetMap =>
  normalizeHomeDemoAssetMap({
    ...DEFAULT_HOME_DEMO_ASSETS,
    ...(overrides ?? {})
  })
