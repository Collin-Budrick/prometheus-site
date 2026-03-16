import type { FragmentHeaderCopy, Lang } from '../lang'
import {
  emptyPlannerDemoCopy,
  emptyPreactIslandCopy,
  emptyReactBinaryDemoCopy,
  emptyUiCopy,
  emptyWasmRendererDemoCopy,
  type LanguageSeedPayload
} from '../lang/selection'
import type { HomeStaticCopyBundle } from './home-render'
import {
  getStaticHomeFragmentHeaders,
  getStaticHomeFragmentTextCopy,
  getStaticHomePlannerDemoCopy,
  getStaticHomePreactIslandDemoCopy,
  getStaticHomeReactBinaryDemoCopy,
  getStaticHomeUiCopy,
  getStaticHomeWasmRendererDemoCopy
} from './home-copy-store'

export const createSeededHomeStaticCopyBundle = (
  languageSeed: LanguageSeedPayload
): HomeStaticCopyBundle => ({
  ui: {
    ...emptyUiCopy,
    ...(languageSeed.ui ?? {})
  },
  planner: {
    ...emptyPlannerDemoCopy,
    ...(languageSeed.demos?.planner ?? {})
  },
  wasmRenderer: {
    ...emptyWasmRendererDemoCopy,
    ...(languageSeed.demos?.wasmRenderer ?? {})
  },
  reactBinary: {
    ...emptyReactBinaryDemoCopy,
    ...(languageSeed.demos?.reactBinary ?? {})
  },
  preactIsland: {
    ...emptyPreactIslandCopy,
    ...(languageSeed.demos?.preactIsland ?? {})
  },
  fragments: {
    ...(languageSeed.fragments ?? {})
  }
})

export const createLiveHomeStaticCopyBundle = (lang: Lang): HomeStaticCopyBundle => ({
  ui: getStaticHomeUiCopy(lang),
  planner: getStaticHomePlannerDemoCopy(lang),
  wasmRenderer: getStaticHomeWasmRendererDemoCopy(lang),
  reactBinary: getStaticHomeReactBinaryDemoCopy(lang),
  preactIsland: getStaticHomePreactIslandDemoCopy(lang),
  fragments: getStaticHomeFragmentTextCopy(lang)
})

export const createSeededHomeStaticFragmentHeaders = (
  languageSeed: LanguageSeedPayload
): Record<string, FragmentHeaderCopy> => ({
  ...(languageSeed.fragmentHeaders ?? {})
})

export const createLiveHomeStaticFragmentHeaders = (
  lang: Lang | string
): Record<string, FragmentHeaderCopy> => getStaticHomeFragmentHeaders(lang)
