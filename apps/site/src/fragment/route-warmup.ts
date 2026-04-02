import type { EarlyHint, FragmentPayload, FragmentPlan } from './types'
import { buildFragmentCssLinks } from './fragment-css'
import { fragmentPlanCache } from './plan-cache'
import { fetchFragmentPlan } from './client'
import {
  buildFragmentBootstrapHref,
  decodeFragmentBootstrapPayloads,
  primeFragmentBootstrapBytes,
  readPrimedFragmentBootstrapBytes
} from './bootstrap-cache'
import { primeConnectedFragmentRuntimeBootstrap } from './runtime/client-bridge'
import { defaultLang, resolveLangParam } from '../shared/lang-store'

const DEFAULT_IDLE_FRAGMENT_WARMUP_LIMIT = 2
const INITIAL_FRAGMENT_WARMUP_HANDLED_KEY = '__PROM_INITIAL_SPECULATION_HANDLED'

type FragmentWarmupWindow = Window & {
  [INITIAL_FRAGMENT_WARMUP_HANDLED_KEY]?: boolean
}

const buildPlanEarlyHints = (plan: FragmentPlan) => {
  const criticalCss: EarlyHint[] = buildFragmentCssLinks(plan, { criticalOnly: true }).map((link) => ({
    href: link.href,
    as: 'style'
  }))
  return [...(plan.earlyHints ?? []), ...criticalCss]
}

const resolveWarmFragmentIds = (plan: FragmentPlan) => {
  const entryIds = new Set(plan.fragments.map((entry) => entry.id))
  const groupedIds =
    plan.fetchGroups?.find((group) => group.some((id) => entryIds.has(id)))?.filter((id) => entryIds.has(id)) ?? []
  if (groupedIds.length) {
    return groupedIds
  }
  return plan.fragments.filter((entry) => entry.critical).map((entry) => entry.id)
}

const attachCacheUpdatedAt = (payloads: Record<string, FragmentPayload>, plan: FragmentPlan) => {
  const updatedAtById = new Map(plan.fragments.map((entry) => [entry.id, entry.cache?.updatedAt]))
  Object.values(payloads).forEach((payload) => {
    const updatedAt = updatedAtById.get(payload.id)
    if (typeof updatedAt === 'number') {
      payload.cacheUpdatedAt = updatedAt
    }
  })
  return payloads
}

const hasCachedWarmFragments = (
  cache: Pick<typeof fragmentPlanCache, 'get'>,
  path: string,
  lang: string,
  ids: string[]
) => {
  const cached = cache.get(path, lang)
  if (!cached) return false
  if (!ids.length) return true
  const cachedFragments = cached.initialFragments ?? {}
  return ids.every((id) => Boolean(cachedFragments[id]))
}

const resolveWarmRoutePath = (href: string, origin: string) => {
  const url = new URL(href, origin)
  return {
    lang: resolveLangParam(url.searchParams.get('lang')) ?? defaultLang,
    path: url.pathname || '/'
  }
}

export const createRouteFragmentWarmupManager = ({
  origin = typeof window !== 'undefined' ? window.location.origin : 'https://prometheus.prod',
  idleLimit = DEFAULT_IDLE_FRAGMENT_WARMUP_LIMIT,
  cache = fragmentPlanCache,
  loadPlan = fetchFragmentPlan,
  buildBootstrapHref = buildFragmentBootstrapHref,
  decodeBootstrap = decodeFragmentBootstrapPayloads,
  primeBootstrap = primeFragmentBootstrapBytes,
  readPrimedBootstrap = readPrimedFragmentBootstrapBytes,
  primeRuntimeBootstrap = primeConnectedFragmentRuntimeBootstrap,
  pageWindow = typeof window !== 'undefined' ? (window as FragmentWarmupWindow) : null
}: {
  origin?: string
  idleLimit?: number
  cache?: typeof fragmentPlanCache
  loadPlan?: typeof fetchFragmentPlan
  buildBootstrapHref?: typeof buildFragmentBootstrapHref
  decodeBootstrap?: typeof decodeFragmentBootstrapPayloads
  primeBootstrap?: typeof primeFragmentBootstrapBytes
  readPrimedBootstrap?: typeof readPrimedFragmentBootstrapBytes
  primeRuntimeBootstrap?: typeof primeConnectedFragmentRuntimeBootstrap
  pageWindow?: FragmentWarmupWindow | null
} = {}) => {
  const pending = new Map<string, Promise<void>>()
  const markInitialWarmupAttempted = () => {
    if (!pageWindow || pageWindow[INITIAL_FRAGMENT_WARMUP_HANDLED_KEY] === true) return
    pageWindow[INITIAL_FRAGMENT_WARMUP_HANDLED_KEY] = true
  }

  const warmRoute = (href: string) => {
    markInitialWarmupAttempted()
    const { path, lang } = resolveWarmRoutePath(href, origin)
    const key = `${lang}|${path}`
    const existing = pending.get(key)
    if (existing) {
      return existing
    }

    const task = (async () => {
      const cached = cache.get(path, lang)
      const plan = cached?.plan ?? (await loadPlan(path, lang))
      const warmFragmentIds = resolveWarmFragmentIds(plan)
      const currentEntry = cache.get(path, lang)

      if (!warmFragmentIds.length) {
        cache.set(path, lang, {
          etag: currentEntry?.etag ?? '',
          plan,
          initialFragments: currentEntry?.initialFragments,
          initialHtml: currentEntry?.initialHtml,
          earlyHints: currentEntry?.earlyHints ?? buildPlanEarlyHints(plan)
        })
        return
      }

      const bootstrapHref = buildBootstrapHref({ ids: warmFragmentIds, lang })
      if (hasCachedWarmFragments(cache, path, lang, warmFragmentIds) && readPrimedBootstrap({ href: bootstrapHref })) {
        return
      }

      const bytes = await primeBootstrap({ href: bootstrapHref })
      const payloads = attachCacheUpdatedAt(decodeBootstrap(bytes), plan)
      cache.set(path, lang, {
        etag: currentEntry?.etag ?? cache.get(path, lang)?.etag ?? '',
        plan,
        initialFragments: {
          ...(currentEntry?.initialFragments ?? {}),
          ...payloads
        },
        initialHtml: currentEntry?.initialHtml,
        earlyHints: currentEntry?.earlyHints ?? buildPlanEarlyHints(plan)
      })
      await primeRuntimeBootstrap(bytes, bootstrapHref)
    })()
      .catch((error) => {
        console.warn('Fragment route warmup failed:', { href, error })
      })
      .finally(() => {
        pending.delete(key)
      })

    pending.set(key, task)
    return task
  }

  return {
    warmRoute,
    warmIdleRoutes(hrefs: string[]) {
      if (hrefs.length) {
        markInitialWarmupAttempted()
      }
      hrefs.slice(0, idleLimit).forEach((href) => {
        void warmRoute(href)
      })
    },
    dispose() {
      pending.clear()
    }
  }
}

export const __private__ = {
  INITIAL_FRAGMENT_WARMUP_HANDLED_KEY,
  attachCacheUpdatedAt,
  buildPlanEarlyHints,
  hasCachedWarmFragments,
  resolveWarmRoutePath,
  resolveWarmFragmentIds,
  resolveInitialWarmupAttempted(win: FragmentWarmupWindow | null | undefined) {
    return win?.[INITIAL_FRAGMENT_WARMUP_HANDLED_KEY] === true
  }
}
