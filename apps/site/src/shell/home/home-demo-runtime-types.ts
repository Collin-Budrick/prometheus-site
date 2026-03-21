import type { HomeDemoActivationResult, HomeDemoKind } from './home-demo-activate'

export const HOME_DEMO_KINDS = [
  'planner',
  'wasm-renderer',
  'react-binary',
  'preact-island'
] as const satisfies readonly HomeDemoKind[]

export const HOME_DEMO_STARTUP_ENTRY_ASSET_PATH =
  'build/static-shell/apps/site/src/shell/home/home-demo-startup-entry.js'

export const HOME_DEMO_ENTRY_ASSET_PATH =
  'build/static-shell/apps/site/src/shell/home/home-demo-entry.js'

export const HOME_DEMO_RUNTIME_ASSET_PATHS = {
  planner: 'build/static-shell/apps/site/src/shell/home/home-demo-planner-runtime.js',
  'wasm-renderer': 'build/static-shell/apps/site/src/shell/home/home-demo-wasm-renderer-runtime.js',
  'react-binary': 'build/static-shell/apps/site/src/shell/home/home-demo-react-binary-runtime.js',
  'preact-island': 'build/static-shell/apps/site/src/shell/home/home-demo-preact-island-runtime.js'
} as const satisfies Record<HomeDemoKind, string>

export const HOME_DEMO_STARTUP_ATTACH_RUNTIME_ASSET_PATH =
  'build/static-shell/apps/site/src/shell/home/home-demo-attach-runtime.js'

export type ActivateHomeDemoOptions = {
  root: Element
  kind: HomeDemoKind
  props: Record<string, unknown>
}

export type HomeDemoRuntimeModule = {
  activateHomeDemo: (options: ActivateHomeDemoOptions) => Promise<HomeDemoActivationResult>
  attachHomeDemo: (options: ActivateHomeDemoOptions) => Promise<HomeDemoActivationResult>
}

export type HomeDemoStartupAttachRuntimeModule = {
  attachHomeDemo: (
    options: ActivateHomeDemoOptions
  ) => Promise<HomeDemoActivationResult | null>
}

export type HomeDemoAssetDescriptor = {
  moduleHref: string
  styleHref: string | null
}

export type HomeDemoAssetMap = Record<HomeDemoKind, HomeDemoAssetDescriptor>

export const normalizeHomeDemoAssetMap = (
  assets?: Partial<HomeDemoAssetMap> | null
): HomeDemoAssetMap => ({
  planner: assets?.planner ?? {
    moduleHref: HOME_DEMO_RUNTIME_ASSET_PATHS.planner,
    styleHref: null
  },
  'wasm-renderer': assets?.['wasm-renderer'] ?? {
    moduleHref: HOME_DEMO_RUNTIME_ASSET_PATHS['wasm-renderer'],
    styleHref: null
  },
  'react-binary': assets?.['react-binary'] ?? {
    moduleHref: HOME_DEMO_RUNTIME_ASSET_PATHS['react-binary'],
    styleHref: null
  },
  'preact-island': assets?.['preact-island'] ?? {
    moduleHref: HOME_DEMO_RUNTIME_ASSET_PATHS['preact-island'],
    styleHref: null
  }
})
