import { resolveStaticAssetUrl } from '../../static-shell/static-asset-url'
import type { FragmentWidgetRuntime } from './fragment-widget-runtime'

export type FragmentWidgetRuntimeModule = {
  createFragmentWidgetRuntime: (options?: {
    root?: ParentNode | null
    observeMutations?: boolean
  }) => FragmentWidgetRuntime
}

export const FRAGMENT_WIDGET_RUNTIME_ASSET_PATH =
  'build/static-shell/apps/site/src/fragment/ui/fragment-widget-runtime.js'

type LoadFragmentWidgetRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<FragmentWidgetRuntimeModule>
}

let fragmentWidgetRuntimePromise: Promise<FragmentWidgetRuntimeModule> | null =
  null

const importFragmentWidgetRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as FragmentWidgetRuntimeModule

export const resolveFragmentWidgetRuntimeUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(FRAGMENT_WIDGET_RUNTIME_ASSET_PATH, options)

export const loadFragmentWidgetRuntime = ({
  assetUrl = resolveFragmentWidgetRuntimeUrl(),
  importer = importFragmentWidgetRuntime
}: LoadFragmentWidgetRuntimeOptions = {}) => {
  if (!fragmentWidgetRuntimePromise) {
    fragmentWidgetRuntimePromise = importer(assetUrl)
  }
  return fragmentWidgetRuntimePromise
}

export const resetFragmentWidgetRuntimeLoaderForTests = () => {
  fragmentWidgetRuntimePromise = null
}
