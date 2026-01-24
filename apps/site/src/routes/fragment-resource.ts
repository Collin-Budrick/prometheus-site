import { type AppConfig } from '@platform/env'
import { loadFragmentPlan, loadFragments } from '@core/fragment/server'
import type { FragmentPayloadMap, FragmentPlanValue } from '../fragment/types'
import { fragmentPlanCache } from '../fragment/plan-cache'
import { defaultLang, normalizeLang, readLangFromCookie, resolveLangParam, type Lang } from '../shared/lang-store'
import { resolveServerApiBase } from '../shared/api-base'
import { readFragmentCriticalFromCookie } from '../fragment/ui/shell-cache'

export type HybridFragmentResource = {
  plan: FragmentPlanValue
  fragments: FragmentPayloadMap
  path: string
}

export const selectInitialFragmentIds = (
  plan: FragmentPlanValue | undefined,
  options: { dynamicCriticalIds?: string[] } = {}
) => {
  if (!plan) return []
  const entryById = new Map(plan.fragments.map((entry) => [entry.id, entry]))
  const critical = plan.fragments.filter((entry) => entry.critical).map((entry) => entry.id)
  const dynamicCritical = options.dynamicCriticalIds?.filter((id) => entryById.has(id)) ?? []
  const combined = Array.from(new Set([...critical, ...dynamicCritical]))
  const fetchGroup = plan.fetchGroups?.[0]?.filter((id) => entryById.has(id)) ?? []
  const seedIds = fetchGroup.length
    ? fetchGroup
    : combined.length
      ? combined
      : plan.fragments.map((entry) => entry.id)
  const required = new Set<string>()
  const stack = [...seedIds]
  while (stack.length) {
    const id = stack.pop()
    if (!id || required.has(id)) continue
    required.add(id)
    const deps = entryById.get(id)?.dependsOn ?? []
    deps.forEach((dep) => {
      if (!required.has(dep)) stack.push(dep)
    })
  }
  return Array.from(required)
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

const resolveViewportHint = (request: Request | undefined) => {
  if (!request) return 'desktop'
  const hint = request.headers.get('sec-ch-ua-mobile')
  if (hint === '?1') return 'mobile'
  if (hint === '?0') return 'desktop'
  const ua = request.headers.get('user-agent')?.toLowerCase() ?? ''
  if (!ua) return 'desktop'
  if (ua.includes('mobi') || ua.includes('android') || ua.includes('iphone') || ua.includes('ipad')) {
    return 'mobile'
  }
  return 'desktop'
}

export const loadHybridFragmentResource = async (
  path: string,
  config: Pick<AppConfig, 'apiBase'>,
  lang?: string,
  request?: Request
): Promise<HybridFragmentResource> => {
  const resolvedApiBase = resolveServerApiBase(config.apiBase, request)
  const viewport = resolveViewportHint(request)
  const dynamicCriticalIds = request
    ? readFragmentCriticalFromCookie(request.headers.get('cookie'), path, viewport)
    : []
  let plan: FragmentPlanValue
  let initialFragments: FragmentPayloadMap | undefined

  try {
    const result = await loadFragmentPlan(path, { apiBase: resolvedApiBase }, lang)
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
      selectInitialFragmentIds(cached.plan as FragmentPlanValue, { dynamicCriticalIds })
    )
    return { plan: cached.plan as FragmentPlanValue, fragments: fallbackFragments, path: cached.plan.path }
  }

  const initialIds = selectInitialFragmentIds(plan, { dynamicCriticalIds })
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
