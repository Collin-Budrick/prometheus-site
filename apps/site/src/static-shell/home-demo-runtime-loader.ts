import type { HomeDemoActivationResult, HomeDemoKind } from './home-demo-activate'
import { resolveStaticAssetUrl } from './static-asset-url'

const HOME_DEMO_RUNTIME_ASSET_PATH = 'build/static-shell/apps/site/src/static-shell/home-demo-runtime.js'

export type ActivateHomeDemoOptions = {
  root: Element
  kind: HomeDemoKind
  props: Record<string, unknown>
}

export type HomeDemoRuntimeModule = {
  activateHomeDemo: (options: ActivateHomeDemoOptions) => Promise<HomeDemoActivationResult>
}

type LoadHomeDemoRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomeDemoRuntimeModule>
}

let homeDemoRuntimePromise: Promise<HomeDemoRuntimeModule> | null = null

const importHomeDemoRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomeDemoRuntimeModule

export const resolveHomeDemoRuntimeUrl = (options?: Parameters<typeof resolveStaticAssetUrl>[1]) =>
  resolveStaticAssetUrl(HOME_DEMO_RUNTIME_ASSET_PATH, options)

export const loadHomeDemoRuntime = ({
  assetUrl = resolveHomeDemoRuntimeUrl(),
  importer = importHomeDemoRuntime
}: LoadHomeDemoRuntimeOptions = {}) => {
  if (!homeDemoRuntimePromise) {
    homeDemoRuntimePromise = importer(assetUrl)
  }
  return homeDemoRuntimePromise
}

export const resetHomeDemoRuntimeLoaderForTests = () => {
  homeDemoRuntimePromise = null
}
