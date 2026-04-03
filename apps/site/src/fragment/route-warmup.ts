import type { EarlyHint, FragmentPayload, FragmentPlan } from './types'
import { buildFragmentCssLinks } from './fragment-css'
import { fragmentPlanCache } from './plan-cache'
import { fetchFragmentBatch, fetchFragmentPlan } from './client'
import {
  buildFragmentBootstrapHref,
  clearPrimedFragmentBootstrapBytes,
  decodeFragmentBootstrapPayloads,
  primeFragmentBootstrapBytes
} from './bootstrap-cache'
import { primeConnectedFragmentRuntimeBootstrap } from './runtime/client-bridge'
import { getPersistentRuntimeCache } from './runtime/persistent-cache-instance'
import { resolveCurrentFragmentUserCacheKey, resolveFragmentCacheScope } from './cache-scope'
import { selectInitialFragmentIds } from './initial-selection'
import { normalizeRoutePath } from '../shared/route-navigation'
import { defaultLang, resolveLangParam } from '../shared/lang-store'

const INITIAL_FRAGMENT_WARMUP_HANDLED_KEY = '__PROM_INITIAL_SPECULATION_HANDLED'

type FragmentWarmupWindow = Window & typeof globalThis & {
  [INITIAL_FRAGMENT_WARMUP_HANDLED_KEY]?: boolean
}

const buildPlanEarlyHints = (plan: FragmentPlan) => {
  const criticalCss: EarlyHint[] = buildFragmentCssLinks(plan, { criticalOnly: true }).map((link) => ({
    href: link.href,
    as: 'style'
  }))
  return [...(plan.earlyHints ?? []), ...criticalCss]
}

const resolveWarmFragmentIds = (plan: FragmentPlan) => selectInitialFragmentIds(plan)

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
  scopeKey: string,
  path: string,
  lang: string,
  ids: string[]
) => {
  const cached = cache.get(path, lang, { scopeKey })
  if (!cached) return false
  if (!ids.length) return true
  const cachedFragments = cached.initialFragments ?? {}
  return ids.every((id) => Boolean(cachedFragments[id]))
}

const hasCachedWarmPayloadIds = (cachedPayloadIds: string[], ids: string[]) => {
  if (!ids.length) return true
  if (!cachedPayloadIds.length) return false
  const cachedPayloadIdSet = new Set(cachedPayloadIds)
  return ids.every((id) => cachedPayloadIdSet.has(id))
}

const resolveWarmRoutePath = (href: string, origin: string) => {
  const url = new URL(href, origin)
  return {
    lang: resolveLangParam(url.searchParams.get('lang')) ?? defaultLang,
    path: normalizeRoutePath(url.pathname || '/')
  }
}

export const createRouteFragmentWarmupManager = ({
  origin = typeof window !== 'undefined' ? window.location.origin : 'https://prometheus.prod',
  cache = fragmentPlanCache,
  loadPlan = fetchFragmentPlan,
  loadFragments = fetchFragmentBatch,
  buildBootstrapHref = buildFragmentBootstrapHref,
  clearPrimedBootstrap = clearPrimedFragmentBootstrapBytes,
  decodeBootstrap = decodeFragmentBootstrapPayloads,
  primeBootstrap = primeFragmentBootstrapBytes,
  primeRuntimeBootstrap = primeConnectedFragmentRuntimeBootstrap,
  payloadCache = getPersistentRuntimeCache(),
  pageWindow = typeof window !== 'undefined' ? (window as FragmentWarmupWindow) : null,
  resolveUserCacheKey = () => resolveCurrentFragmentUserCacheKey(pageWindow)
}: {
  origin?: string
  cache?: typeof fragmentPlanCache
  loadPlan?: typeof fetchFragmentPlan
  loadFragments?: typeof fetchFragmentBatch
  buildBootstrapHref?: typeof buildFragmentBootstrapHref
  clearPrimedBootstrap?: typeof clearPrimedFragmentBootstrapBytes
  decodeBootstrap?: typeof decodeFragmentBootstrapPayloads
  primeBootstrap?: typeof primeFragmentBootstrapBytes
  primeRuntimeBootstrap?: typeof primeConnectedFragmentRuntimeBootstrap
  payloadCache?: Pick<ReturnType<typeof getPersistentRuntimeCache>, 'seedPayloads' | 'listPayloadIds'>
  resolveUserCacheKey?: () => string | null
  pageWindow?: FragmentWarmupWindow | null
} = {}) => {
  const pending = new Map<string, Promise<void>>()
  const markInitialWarmupAttempted = () => {
    if (!pageWindow || pageWindow[INITIAL_FRAGMENT_WARMUP_HANDLED_KEY] === true) return
    pageWindow[INITIAL_FRAGMENT_WARMUP_HANDLED_KEY] = true
  }

  const warmRoute = (href: string, options: { force?: boolean } = {}) => {
    markInitialWarmupAttempted()
    const { path, lang } = resolveWarmRoutePath(href, origin)
    const scopeKey = resolveFragmentCacheScope(path, resolveUserCacheKey())
    const key = `${scopeKey}|${lang}|${path}|${options.force === true ? 'force' : 'cache'}`
    const existing = pending.get(key)
    if (existing) {
      return existing
    }

    const task = (async () => {
      if (options.force) {
        cache.delete?.(path, lang, { scopeKey })
      }
      const cached = cache.get(path, lang, { scopeKey })
      const plan = cached?.plan ?? (await loadPlan(path, lang))
      const cachedPayloadIds = await payloadCache.listPayloadIds(scopeKey, path, lang)
      const warmFragmentIds = Array.from(new Set([...resolveWarmFragmentIds(plan), ...cachedPayloadIds]))
      const currentEntry = cache.get(path, lang, { scopeKey })

      if (!warmFragmentIds.length) {
        cache.set(path, lang, {
          etag: currentEntry?.etag ?? '',
          plan,
          initialFragments: currentEntry?.initialFragments,
          initialHtml: currentEntry?.initialHtml,
          earlyHints: currentEntry?.earlyHints ?? buildPlanEarlyHints(plan)
        }, { scopeKey })
        return
      }

      const bootstrapHref = buildBootstrapHref({ ids: warmFragmentIds, lang })
      if (!options.force && (
        hasCachedWarmFragments(cache, scopeKey, path, lang, warmFragmentIds) ||
        hasCachedWarmPayloadIds(cachedPayloadIds, warmFragmentIds)
      )) {
        cache.set(path, lang, {
          etag: currentEntry?.etag ?? cache.get(path, lang, { scopeKey })?.etag ?? '',
          plan,
          initialFragments: currentEntry?.initialFragments,
          initialHtml: currentEntry?.initialHtml,
          earlyHints: currentEntry?.earlyHints ?? buildPlanEarlyHints(plan)
        }, { scopeKey })
        return
      }

      if (options.force) {
        clearPrimedBootstrap({ href: bootstrapHref })
      }
      const bytes = await primeBootstrap({ href: bootstrapHref, cache: options.force ? 'reload' : 'default' })
      const payloads = attachCacheUpdatedAt(decodeBootstrap(bytes), plan)
      const missingIds = warmFragmentIds.filter((id) => !payloads[id])
      if (missingIds.length) {
        const fetchedPayloads = attachCacheUpdatedAt(
          await loadFragments(
            missingIds.map((id) => ({
              id,
              refresh: options.force === true ? true : undefined
            })),
            {
              lang,
              refresh: options.force === true ? true : undefined
            }
          ),
          plan
        )
        Object.assign(payloads, fetchedPayloads)
      }
      await payloadCache.seedPayloads(scopeKey, path, lang, Object.values(payloads))
      cache.set(path, lang, {
        etag: currentEntry?.etag ?? cache.get(path, lang, { scopeKey })?.etag ?? '',
        plan,
        initialFragments: {
          ...(currentEntry?.initialFragments ?? {}),
          ...payloads
        },
        initialHtml: currentEntry?.initialHtml,
        earlyHints: currentEntry?.earlyHints ?? buildPlanEarlyHints(plan)
      }, { scopeKey })
      if (bytes.byteLength > 0) {
        await primeRuntimeBootstrap(bytes, bootstrapHref)
      }
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
    warmIdleRoutes(hrefs: string[], options?: { force?: boolean }) {
      if (hrefs.length) {
        markInitialWarmupAttempted()
      }
      hrefs.forEach((href) => {
        void warmRoute(href, options)
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
  hasCachedWarmPayloadIds,
  resolveWarmRoutePath,
  resolveWarmFragmentIds,
  resolveInitialWarmupAttempted(win: FragmentWarmupWindow | null | undefined) {
    return win?.[INITIAL_FRAGMENT_WARMUP_HANDLED_KEY] === true
  }
}
