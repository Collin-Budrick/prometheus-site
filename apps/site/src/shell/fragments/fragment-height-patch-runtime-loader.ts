import { resolveStaticAssetUrl } from '../core/static-asset-url'

const FRAGMENT_HEIGHT_PATCH_RUNTIME_ASSET_PATH =
  'build/static-shell/apps/site/src/shell/fragments/fragment-height-patch-runtime.js'

export type FragmentHeightPatchRuntimeModule = {
  settlePatchedFragmentCardHeight: typeof import('./fragment-height').settlePatchedFragmentCardHeight
}

type LoadFragmentHeightPatchRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<FragmentHeightPatchRuntimeModule>
}

let fragmentHeightPatchRuntimePromise: Promise<FragmentHeightPatchRuntimeModule> | null = null

const importFragmentHeightPatchRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as FragmentHeightPatchRuntimeModule

export const resolveFragmentHeightPatchRuntimeUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(FRAGMENT_HEIGHT_PATCH_RUNTIME_ASSET_PATH, options)

export const loadFragmentHeightPatchRuntime = ({
  assetUrl = resolveFragmentHeightPatchRuntimeUrl(),
  importer = importFragmentHeightPatchRuntime
}: LoadFragmentHeightPatchRuntimeOptions = {}) => {
  if (!fragmentHeightPatchRuntimePromise) {
    fragmentHeightPatchRuntimePromise = importer(assetUrl)
  }
  return fragmentHeightPatchRuntimePromise
}

export const resetFragmentHeightPatchRuntimeLoaderForTests = () => {
  fragmentHeightPatchRuntimePromise = null
}
