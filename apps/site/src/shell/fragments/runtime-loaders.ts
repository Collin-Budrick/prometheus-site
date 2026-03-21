import { resolveStaticAssetUrl } from '../core/static-asset-url'

const FRAGMENT_BOOTSTRAP_RUNTIME_ASSET_PATH =
  'build/static-shell/apps/site/src/shell/fragments/fragment-bootstrap-runtime.js'
const FRAGMENT_HEIGHT_PATCH_RUNTIME_ASSET_PATH =
  'build/static-shell/apps/site/src/shell/fragments/fragment-height-patch-runtime.js'

export type FragmentBootstrapRuntimeModule = {
  bootstrapStaticFragmentShell: () => Promise<void>
}

export type FragmentHeightPatchRuntimeModule = {
  settlePatchedFragmentCardHeight: typeof import('./fragment-height').settlePatchedFragmentCardHeight
}

type LoadFragmentBootstrapRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<FragmentBootstrapRuntimeModule>
}

type LoadFragmentHeightPatchRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<FragmentHeightPatchRuntimeModule>
}

let fragmentBootstrapRuntimePromise: Promise<FragmentBootstrapRuntimeModule> | null = null
let fragmentHeightPatchRuntimePromise: Promise<FragmentHeightPatchRuntimeModule> | null = null

const importFragmentBootstrapRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as FragmentBootstrapRuntimeModule

const importFragmentHeightPatchRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as FragmentHeightPatchRuntimeModule

export const resolveFragmentBootstrapRuntimeUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(FRAGMENT_BOOTSTRAP_RUNTIME_ASSET_PATH, options)

export const resolveFragmentHeightPatchRuntimeUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(FRAGMENT_HEIGHT_PATCH_RUNTIME_ASSET_PATH, options)

export const loadFragmentBootstrapRuntime = ({
  assetUrl = resolveFragmentBootstrapRuntimeUrl(),
  importer = importFragmentBootstrapRuntime
}: LoadFragmentBootstrapRuntimeOptions = {}) => {
  if (!fragmentBootstrapRuntimePromise) {
    fragmentBootstrapRuntimePromise = importer(assetUrl)
  }
  return fragmentBootstrapRuntimePromise
}

export const loadFragmentHeightPatchRuntime = ({
  assetUrl = resolveFragmentHeightPatchRuntimeUrl(),
  importer = importFragmentHeightPatchRuntime
}: LoadFragmentHeightPatchRuntimeOptions = {}) => {
  if (!fragmentHeightPatchRuntimePromise) {
    fragmentHeightPatchRuntimePromise = importer(assetUrl)
  }
  return fragmentHeightPatchRuntimePromise
}

export const resetFragmentRuntimeLoadersForTests = () => {
  fragmentBootstrapRuntimePromise = null
  fragmentHeightPatchRuntimePromise = null
}

export const resetFragmentBootstrapRuntimeLoaderForTests = resetFragmentRuntimeLoadersForTests
export const resetFragmentHeightPatchRuntimeLoaderForTests = resetFragmentRuntimeLoadersForTests
