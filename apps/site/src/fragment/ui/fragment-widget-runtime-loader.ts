import type { FragmentWidgetRuntime } from './fragment-widget-runtime'

export type FragmentWidgetRuntimeModule = {
  createFragmentWidgetRuntime: (options?: {
    root?: ParentNode | null
    observeMutations?: boolean
  }) => FragmentWidgetRuntime
}

let fragmentWidgetRuntimePromise: Promise<FragmentWidgetRuntimeModule> | null =
  null

export const loadFragmentWidgetRuntime = () => {
  if (!fragmentWidgetRuntimePromise) {
    fragmentWidgetRuntimePromise = import('./fragment-widget-runtime')
  }
  return fragmentWidgetRuntimePromise
}

export const resetFragmentWidgetRuntimeLoaderForTests = () => {
  fragmentWidgetRuntimePromise = null
}

