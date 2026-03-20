import { decodeFragmentPayload } from '@core/fragment/binary'
import { loadFragmentPlan, loadFragments } from '@core/fragment/server'
import { createFragmentService } from '@core/fragment/service'
import { createMemoryFragmentStore, type StoredFragment } from '@core/fragment/store'
import type { FragmentPayloadMap, FragmentPlanValue } from '../fragment/types'
import { fragmentPlanCache } from '../fragment/plan-cache'
import { defaultLang, normalizeLang, readLangFromCookie, resolveLangParam, type Lang } from '../shared/lang-store'
import { readFragmentCriticalFromCookie } from '../fragment/ui/shell-cache'
import { selectInitialFragmentIds } from '../fragment/initial-selection'
import { isHomeStaticPath } from '../static-shell/constants'
import { createFragmentTranslator } from '../fragment/definitions/i18n'
import { registerSiteFragmentBundles } from '../fragment/definitions/register'
import { appConfig } from '../public-app-config'

export type HybridFragmentResource = {
  plan: FragmentPlanValue
  fragments: FragmentPayloadMap
  path: string
  initialHtml?: Record<string, string>
}

type LoadHybridFragmentResourceOptions = {
  includeAllFragments?: boolean
}

type StaticFragmentPrewarmTarget = {
  path: string
  lang: string
}

const readPlanInitialHtml = (plan: FragmentPlanValue | undefined) =>
  (plan as FragmentPlanValue & { initialHtml?: Record<string, string> } | undefined)?.initialHtml

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

export const resolveViewportHint = (request: Request | undefined) => {
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

let staticFragmentServicePromise: Promise<ReturnType<typeof createFragmentService>> | null = null
const DEFAULT_STATIC_FRAGMENT_PREWARM_TARGETS: readonly StaticFragmentPrewarmTarget[] = [
  { path: '/', lang: defaultLang }
] as const
let staticFragmentResourcePrewarmPromise: Promise<void> | null = null

const loadStaticFragmentService = async () => {
  if (!staticFragmentServicePromise) {
    staticFragmentServicePromise = (async () => {
      registerSiteFragmentBundles({ template: appConfig.template })
      return createFragmentService({
        store: createMemoryFragmentStore(),
        createTranslator: createFragmentTranslator
      })
    })()
  }

  return staticFragmentServicePromise
}

const decodeStoredFragment = (id: string, entry: StoredFragment) => ({
  ...decodeFragmentPayload(entry.payload),
  id,
  cacheUpdatedAt: entry.updatedAt
})

export const loadHybridFragmentResource = async (
  path: string,
  config: { apiBase: string },
  lang?: string,
  request?: Request,
  options: LoadHybridFragmentResourceOptions = {}
): Promise<HybridFragmentResource> => {
  const { resolveServerApiBase } = await import('../shared/api-base.server')
  const resolvedApiBase = resolveServerApiBase(config.apiBase, request)
  const viewport = resolveViewportHint(request)
  const dynamicCriticalIds = request && !isHomeStaticPath(path)
    ? readFragmentCriticalFromCookie(request.headers.get('cookie'), path, viewport)
    : []
  const selectRequestedIds = (resolvedPlan: FragmentPlanValue) => {
    const plan = resolvedPlan as FragmentPlanValue
    return options.includeAllFragments
      ? plan.fragments.map((entry) => entry.id)
      : selectInitialFragmentIds(plan, { dynamicCriticalIds })
  }
  const cached = fragmentPlanCache.get(path, lang)
  if (cached?.plan && (cached.initialFragments || cached.initialHtml)) {
    const cachedPlan = cached.plan
    const requestedIds = selectRequestedIds(cachedPlan as FragmentPlanValue)
    const fallbackFragments = pickFragments(cached.initialFragments, requestedIds)
    return {
      plan: cachedPlan as FragmentPlanValue,
      fragments: fallbackFragments,
      path: cachedPlan.path,
      initialHtml: cached.initialHtml
    }
  }
  let plan: FragmentPlanValue
  let initialFragments: FragmentPayloadMap | undefined

  try {
    const result = await loadFragmentPlan(path, { apiBase: resolvedApiBase }, lang, { protocol: 2 })
    plan = result.plan
    initialFragments = result.initialFragments
  } catch (error) {
    if (!cached) {
      throw error
    }
    console.warn('Fragment plan fetch failed, using cached entry', error)
    const requestedIds = selectRequestedIds(cached.plan as FragmentPlanValue)
    const fallbackFragments = pickFragments(
      cached.initialFragments,
      requestedIds
    )
    return {
      plan: cached.plan as FragmentPlanValue,
      fragments: fallbackFragments,
      path: cached.plan.path,
      initialHtml: cached.initialHtml
    }
  }

  const requestedIds = selectRequestedIds(plan)
  let fragments: FragmentPayloadMap = pickFragments(initialFragments, requestedIds)
  const missingIds = requestedIds.filter((id) => !fragments[id])

  if (missingIds.length) {
    try {
      const fetched = await loadFragments(missingIds, { apiBase: resolvedApiBase }, lang, { protocol: 2 })
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
  const initialHtml = readPlanInitialHtml(plan)
  fragmentPlanCache.set(path, lang, {
    etag: cachedEntry?.etag ?? '',
    plan,
    initialFragments: fragments,
    initialHtml
  })

  return {
    plan,
    fragments,
    path: plan.path,
    initialHtml
  }
}

export const loadStaticFragmentResource = async (
  path: string,
  lang: string = defaultLang,
  _request?: Request
): Promise<HybridFragmentResource> => {
  const cached = fragmentPlanCache.get(path, lang)
  if (cached?.plan && cached.initialFragments) {
    return {
      plan: cached.plan as FragmentPlanValue,
      fragments: cached.initialFragments,
      path: cached.plan.path,
      initialHtml: cached.initialHtml
    }
  }

  const fragmentService = await loadStaticFragmentService()
  const plan = await fragmentService.getFragmentPlan(path, lang)
  const fragmentIds = plan.fragments.map((entry) => entry.id)
  const entries = await Promise.all(
    fragmentIds.map(async (id) => [id, await fragmentService.getFragmentEntry(id, { lang })] as const)
  )
  const fragments = entries.reduce<FragmentPayloadMap>((acc, [id, entry]) => {
    acc[id] = decodeStoredFragment(id, entry)
    return acc
  }, {})
  const initialHtml = entries.reduce<Record<string, string>>((acc, [id, entry]) => {
    if (typeof entry.html === 'string' && entry.html.length > 0) {
      acc[id] = entry.html
    }
    return acc
  }, {})

  fragmentPlanCache.set(path, lang, {
    etag: 'static-shell',
    plan,
    initialFragments: fragments,
    initialHtml: Object.keys(initialHtml).length ? initialHtml : undefined
  })

  return {
    plan,
    fragments,
    path: plan.path,
    initialHtml: Object.keys(initialHtml).length ? initialHtml : undefined
  }
}

export const prewarmStaticFragmentResources = (
  targets: readonly StaticFragmentPrewarmTarget[] = DEFAULT_STATIC_FRAGMENT_PREWARM_TARGETS
) => {
  const run = async () => {
    await Promise.all(
      targets.map(async ({ path, lang }) => {
        await loadStaticFragmentResource(path, lang)
      })
    )
  }

  if (targets !== DEFAULT_STATIC_FRAGMENT_PREWARM_TARGETS) {
    return run()
  }

  staticFragmentResourcePrewarmPromise ??= run().catch((error) => {
    staticFragmentResourcePrewarmPromise = null
    throw error
  })

  return staticFragmentResourcePrewarmPromise
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
