import { buildCacheStatus, createFragmentService } from '@core/fragments'
import { fragmentStore } from './store'
import { createFragmentTranslator, defaultFragmentLang, type FragmentLang } from './i18n'
import '@site/fragments/home'

const fragmentService = createFragmentService({
  store: fragmentStore,
  createTranslator: createFragmentTranslator
})

export const {
  clearPlanMemo,
  getFragmentEntry,
  getFragmentHtml,
  getFragmentPayload,
  getFragmentPlan,
  getMemoizedPlan,
  memoizeFragmentPlan,
  streamFragmentsForPath
} = fragmentService

export { buildCacheStatus }

export { defaultFragmentLang }
export type { FragmentLang }
