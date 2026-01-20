import { type AppConfig } from '@platform/env'
import { loadFragmentPlan, loadFragments } from '@core/fragment/server'
import type { FragmentPayloadMap, FragmentPlanValue } from '../fragment/types'
import { fragmentPlanCache } from '../fragment/plan-cache'
import { defaultLang, normalizeLang, readLangFromCookie, resolveLangParam, type Lang } from '../shared/lang-store'
import { resolveServerApiBase } from '../shared/api-base'

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
  lang?: string,
  request?: Request
): Promise<HybridFragmentResource> => {
  const resolvedApiBase = resolveServerApiBase(config.apiBase, request)
  let plan: FragmentPlanValue
  let initialFragments: FragmentPayloadMap | undefined

  try {
    const result = await loadFragmentPlan(path, { apiBase: resolvedApiBase }, lang, { includeInitial: false })
    plan = result.plan
    initialFragments = result.initialFragments
  } catch (error) {
    const cached = fragmentPlanCache.get(path, lang)
    if (!cached) {
      throw error
    }
    console.warn('Fragment plan fetch failed, using cached entry', error)
    const fallbackFragments = pickFragments(
      cached.initialFragments,
      selectInitialFragmentIds(cached.plan as FragmentPlanValue)
    )
    return { plan: cached.plan as FragmentPlanValue, fragments: fallbackFragments, path: cached.plan.path }
  }

  const initialIds = selectInitialFragmentIds(plan)
  let fragments: FragmentPayloadMap = pickFragments(initialFragments, initialIds)
  const missingIds = initialIds.filter((id) => !fragments[id])

  if (missingIds.length) {
    try {
      const fetched = await loadFragments(missingIds, { apiBase: resolvedApiBase }, lang)
      fragments = { ...fragments, ...fetched }
    } catch (error) {
      console.error('Fragment load failed', error)
      const cached = fragmentPlanCache.get(plan.path, lang)
      if (cached?.initialFragments) {
        fragments = { ...fragments, ...pickFragments(cached.initialFragments, missingIds) }
      }
    }
  }

  const cachedEntry = fragmentPlanCache.get(path, lang)
  fragmentPlanCache.set(path, lang, {
    etag: cachedEntry?.etag ?? '',
    plan,
    initialFragments: fragments
  })

  return { plan, fragments, path: plan.path }
}

export const resolveRequestLang = (request: Request): Lang => {
  const queryLang = resolveLangParam(new URL(request.url).searchParams.get('lang'))
  if (queryLang) return queryLang
  const cookieLang = readLangFromCookie(request.headers.get('cookie'))
  const acceptLang = request.headers.get('accept-language')
  if (cookieLang) return cookieLang
  if (acceptLang) return normalizeLang(acceptLang.split(',')[0])
  return defaultLang
}
