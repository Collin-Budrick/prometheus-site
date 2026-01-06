import type { AppConfig } from '@platform/env'
import { loadFragmentPlan, loadFragments } from '@core/fragment/server'
import type { FragmentPayloadMap, FragmentPlanValue } from '../fragment/types'
import { defaultLang, normalizeLang, readLangFromCookie, type Lang } from '../shared/lang-store'

export type HybridFragmentResource = {
  plan: FragmentPlanValue
  fragments: FragmentPayloadMap
  path: string
}

export const selectInitialFragmentIds = (plan: FragmentPlanValue | undefined) => {
  if (!plan) return []
  const critical = plan.fragments.filter((entry) => entry.critical).map((entry) => entry.id)
  if (critical.length) return Array.from(new Set(critical))
  const primaryGroup =
    plan.fetchGroups && plan.fetchGroups.length
      ? plan.fetchGroups[0]
      : plan.fragments.map((fragment) => fragment.id)
  return Array.from(new Set(primaryGroup))
}

const pickFragments = (fragments: FragmentPayloadMap | undefined, ids: string[]) => {
  if (!fragments) return {}
  return ids.reduce<FragmentPayloadMap>((acc, id) => {
    const fragment = fragments[id]
    if (fragment) {
      acc[id] = fragment
    }
    return acc
  }, {})
}

export const loadHybridFragmentResource = async (
  path: string,
  config: Pick<AppConfig, 'apiBase'>,
  lang?: string
): Promise<HybridFragmentResource> => {
  const { plan, initialFragments } = await loadFragmentPlan(path, config, lang, { includeInitial: false })
  const initialIds = selectInitialFragmentIds(plan)
  let fragments: FragmentPayloadMap = pickFragments(initialFragments, initialIds)
  const missingIds = initialIds.filter((id) => !fragments[id])

  if (missingIds.length) {
    try {
      const fetched = await loadFragments(missingIds, config, lang)
      fragments = { ...fragments, ...fetched }
    } catch (error) {
      console.error('Fragment load failed', error)
    }
  }

  return { plan, fragments, path: plan.path }
}

export const resolveRequestLang = (request: Request): Lang => {
  const cookieLang = readLangFromCookie(request.headers.get('cookie'))
  const acceptLang = request.headers.get('accept-language')
  if (cookieLang) return cookieLang
  if (acceptLang) return normalizeLang(acceptLang.split(',')[0])
  return defaultLang
}
