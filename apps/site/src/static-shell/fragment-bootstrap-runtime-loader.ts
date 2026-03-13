import { resolveStaticAssetUrl } from './static-asset-url'

const FRAGMENT_BOOTSTRAP_RUNTIME_ASSET_PATH =
  'build/static-shell/apps/site/src/static-shell/fragment-bootstrap-runtime.js'

export type FragmentBootstrapRuntimeModule = {
  bootstrapStaticFragmentShell: () => Promise<void>
}

type LoadFragmentBootstrapRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<FragmentBootstrapRuntimeModule>
}

let fragmentBootstrapRuntimePromise: Promise<FragmentBootstrapRuntimeModule> | null = null

const importFragmentBootstrapRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as FragmentBootstrapRuntimeModule

export const resolveFragmentBootstrapRuntimeUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(FRAGMENT_BOOTSTRAP_RUNTIME_ASSET_PATH, options)

export const loadFragmentBootstrapRuntime = ({
  assetUrl = resolveFragmentBootstrapRuntimeUrl(),
  importer = importFragmentBootstrapRuntime
}: LoadFragmentBootstrapRuntimeOptions = {}) => {
  if (!fragmentBootstrapRuntimePromise) {
    fragmentBootstrapRuntimePromise = importer(assetUrl)
  }
  return fragmentBootstrapRuntimePromise
}

export const resetFragmentBootstrapRuntimeLoaderForTests = () => {
  fragmentBootstrapRuntimePromise = null
}
