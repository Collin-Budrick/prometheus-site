import plannerStyleHref from './home-demo-planner.css?url'
import preactIslandStyleHref from './home-demo-preact-island.css?url'
import reactBinaryStyleHref from './home-demo-react-binary.css?url'
import wasmRendererStyleHref from './home-demo-wasm-renderer.css?url'
import {
  HOME_DEMO_RUNTIME_ASSET_PATHS,
  normalizeHomeDemoAssetMap,
  type HomeDemoAssetMap
} from './home-demo-runtime-types'

export const DEFAULT_HOME_DEMO_ASSETS: HomeDemoAssetMap = {
  planner: {
    moduleHref: HOME_DEMO_RUNTIME_ASSET_PATHS.planner,
    styleHref: plannerStyleHref
  },
  'wasm-renderer': {
    moduleHref: HOME_DEMO_RUNTIME_ASSET_PATHS['wasm-renderer'],
    styleHref: wasmRendererStyleHref
  },
  'react-binary': {
    moduleHref: HOME_DEMO_RUNTIME_ASSET_PATHS['react-binary'],
    styleHref: reactBinaryStyleHref
  },
  'preact-island': {
    moduleHref: HOME_DEMO_RUNTIME_ASSET_PATHS['preact-island'],
    styleHref: preactIslandStyleHref
  }
}

export const createHomeDemoAssetMap = (
  overrides?: Partial<HomeDemoAssetMap> | null
): HomeDemoAssetMap =>
  normalizeHomeDemoAssetMap({
    ...DEFAULT_HOME_DEMO_ASSETS,
    ...(overrides ?? {})
  })
