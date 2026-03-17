import { component$, useSignal, useVisibleTask$, type Signal } from '@builder.io/qwik'
import type {
  FragmentPayload,
  FragmentPayloadMap,
  FragmentPayloadValue,
  FragmentPlanValue
} from '../types'
import {
  buildFragmentHeightPlanSignature,
  buildFragmentHeightVersionSignature,
  getFragmentHeightViewport,
  readFragmentHeightCookieHeights,
  readFragmentStableHeight
} from '@prometheus/ui/fragment-height'
import { applyFragmentEffects, teardownFragmentEffects } from '../client'
import { useSharedLangSignal } from '../../shared/lang-bridge'
import { runLangViewTransition } from '../../shared/view-transitions'
import { appConfig } from '../../public-app-config'
import { getPublicFragmentApiBase } from '../../shared/public-fragment-config'
import { clearFragmentPlanCache } from '../plan-cache'
import { clearFragmentShellCache } from './shell-cache'
import { resolveFragments, resolvePlan } from './utils'
import type { Lang } from '../../shared/lang-store'
import type { FragmentShellMode } from './fragment-shell-types'
import { FragmentRuntimeBridge } from '../runtime/client-bridge'
import type {
  FragmentRuntimeCardSizing,
  FragmentRuntimePlanEntry,
  FragmentRuntimePriority,
  FragmentRuntimeSizingMap,
  FragmentRuntimeStatus
} from '../runtime/protocol'

const FRAGMENT_SELECTOR = '[data-fragment-id]'
const FRAGMENT_ROOT_MARGIN = appConfig.fragmentVisibilityMargin
const FRAGMENT_THRESHOLD = appConfig.fragmentVisibilityThreshold
const FRAGMENT_STREAMING_ENABLED = appConfig.enableFragmentStreaming
const STABLE_HEIGHT_EVENT = 'prom:fragment-stable-height'

type FragmentStartupDebugEntry = {
  at: number
  kind: 'fetch'
  shellMode: FragmentShellMode
  startupReady: boolean
  ids: string[]
  nonCriticalIds: string[]
}

declare global {
  interface Window {
    __PROM_FRAGMENT_STARTUP_DEBUG__?: FragmentStartupDebugEntry[]
  }
}

type FragmentStreamControllerProps = {
  shellMode: FragmentShellMode
  plan: FragmentPlanValue
  initialFragments: FragmentPayloadValue
  path: string
  fragments: Signal<FragmentPayloadMap>
  workerSizing: Signal<Record<string, FragmentRuntimeCardSizing>>
  layoutTick?: Signal<number>
  status: Signal<'idle' | 'streaming' | 'error'>
  paused?: Signal<boolean> | boolean
  preserveFragmentEffects?: boolean
  initialLang?: Lang
  dynamicCriticalIds?: Signal<string[]>
}

type FragmentHmrEventPayload = {
  clearCaches?: boolean
}

const recordFragmentStartupDebug = (
  entry: Omit<FragmentStartupDebugEntry, 'at'>
) => {
  if (typeof window === 'undefined') return
  const at = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const nextEntry: FragmentStartupDebugEntry = {
    at,
    ...entry
  }
  const log = window.__PROM_FRAGMENT_STARTUP_DEBUG__ ?? []
  log.push(nextEntry)
  window.__PROM_FRAGMENT_STARTUP_DEBUG__ = log
}

const buildRuntimeClientId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `fragment-runtime:${crypto.randomUUID()}`
  }
  return `fragment-runtime:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`
}

const normalizeRuntimePlanEntries = (plan: ReturnType<typeof resolvePlan>): FragmentRuntimePlanEntry[] =>
  plan.fragments.map((entry) => ({
    id: entry.id,
    critical: entry.critical,
    layout: entry.layout,
    dependsOn: entry.dependsOn ?? [],
    cacheUpdatedAt: entry.cache?.updatedAt
  }))

const normalizeRuntimeFetchGroups = (plan: ReturnType<typeof resolvePlan>) =>
  plan.fetchGroups?.map((group) => [...group]) ?? []

const resolveInitialSizingSeeds = (
  path: string,
  lang: string,
  plan: ReturnType<typeof resolvePlan>
): FragmentRuntimeSizingMap => {
  if (typeof document === 'undefined') return {}

  const planSignature = buildFragmentHeightPlanSignature(plan.fragments.map((entry) => entry.id))
  const versionSignature = buildFragmentHeightVersionSignature(
    plan.fragments.reduce<Record<string, number>>((acc, entry) => {
      const value = entry.cache?.updatedAt
      if (typeof value === 'number' && Number.isFinite(value)) {
        acc[entry.id] = value
      }
      return acc
    }, {}),
    plan.fragments.map((entry) => entry.id)
  )
  const viewport = getFragmentHeightViewport()
  const cookieHeights = readFragmentHeightCookieHeights(document.cookie, {
    path,
    lang,
    viewport,
    planSignature,
    versionSignature
  })

  return plan.fragments.reduce<FragmentRuntimeSizingMap>((acc, entry, index) => {
    const stableHeight = readFragmentStableHeight({
      fragmentId: entry.id,
      path,
      lang,
      planSignature,
      versionSignature
    })
    const cookieHeight = cookieHeights?.[index] ?? null
    if (stableHeight === null && cookieHeight === null) {
      return acc
    }
    acc[entry.id] = {
      stableHeight,
      cookieHeight
    }
    return acc
  }, {})
}

const resolveCardWidth = (element: HTMLElement) => {
  const rect = Math.ceil(element.getBoundingClientRect().width)
  return rect > 0 ? rect : null
}

export const FragmentStreamController = component$(
  ({
    shellMode,
    plan,
    initialFragments,
    path,
    fragments,
    workerSizing,
    layoutTick,
    status,
    paused,
    preserveFragmentEffects,
    initialLang,
    dynamicCriticalIds
  }: FragmentStreamControllerProps) => {
    const langSignal = useSharedLangSignal()
    const lastLang = useSignal<string | null>(initialLang ?? null)
    const dynamicCriticalUpdater = useSignal<((ids: string[]) => void) | null>(null)
    const lifecyclePaused = useSignal(false)

    useVisibleTask$(
      (ctx) => {
        if (typeof window === 'undefined') return
        const handlePageHide = () => {
          lifecyclePaused.value = true
        }
        const handlePageShow = () => {
          lifecyclePaused.value = false
        }

        window.addEventListener('pagehide', handlePageHide)
        window.addEventListener('pageshow', handlePageShow)
        ctx.cleanup(() => {
          window.removeEventListener('pagehide', handlePageHide)
          window.removeEventListener('pageshow', handlePageShow)
        })
      },
      { strategy: 'document-ready' }
    )

    useVisibleTask$(
      (ctx) => {
        let active = true
        const isPaused = ctx.track(() =>
          (typeof paused === 'boolean' ? paused : paused ? paused.value : false) || lifecyclePaused.value
        )
        const pending = new Map<string, FragmentPayload>()
        const queued = new Set<string>()
        const observed = new WeakSet<Element>()
        const requestedIds = new Set<string>()
        const elementsById = new Map<string, HTMLElement>()
        const visibleIds = new Set<string>()
        let observer: IntersectionObserver | null = null
        let resizeObserver: ResizeObserver | null = null
        let flushHandle: number | null = null
        let microtaskFlushScheduled = false
        let hmrTimer: number | null = null
        let hmrClearCachesPending = false
        const activeLang = ctx.track(() => langSignal.value)
        const langChanged = lastLang.value !== null && lastLang.value !== activeLang
        lastLang.value = activeLang
        const refreshIds = new Set<string>()
        const refreshQueue = new Set<string>()
        const shouldAnimateLangSwap = langChanged
        let langTransitionInFlight = false
        const canObserve = 'IntersectionObserver' in window
        const planValue = resolvePlan(plan)
        if (langChanged) {
          planValue.fragments.forEach((entry) => refreshIds.add(entry.id))
        }
        const entryById = new Map(planValue.fragments.map((entry) => [entry.id, entry]))
        const normalizePayload = (payload: FragmentPayload): FragmentPayload => {
          if (payload.cacheUpdatedAt !== undefined) {
            return payload
          }
          const cacheUpdatedAt = entryById.get(payload.id)?.cache?.updatedAt
          if (typeof cacheUpdatedAt !== 'number') {
            return payload
          }
          return { ...payload, cacheUpdatedAt }
        }

        if (!fragments.value || !Object.keys(fragments.value).length) {
          const resolvedInitial = resolveFragments(initialFragments) ?? {}
          fragments.value = Object.values(resolvedInitial).reduce<FragmentPayloadMap>((acc, payload) => {
            const normalized = normalizePayload(payload)
            acc[normalized.id] = normalized
            return acc
          }, {})
        }

        if (isPaused) {
          status.value = 'idle'
          ctx.cleanup(() => {
            active = false
          })
          return
        }

        const allIds = planValue.fragments.map((entry) => entry.id)
        const staticCriticalIds = new Set(planValue.fragments.filter((entry) => entry.critical).map((entry) => entry.id))
        const criticalIds = Array.from(staticCriticalIds)
        const dynamicCriticalSeed = dynamicCriticalIds?.value ?? []
        const dynamicCriticalSet = new Set<string>()
        const isCriticalId = (id: string) => staticCriticalIds.has(id) || dynamicCriticalSet.has(id)
        const hasMissingCriticalFragments = criticalIds.some((id) => !fragments.value[id])

        if (!canObserve) {
          Object.values(fragments.value).forEach((payload) => applyFragmentEffects(payload))
        } else {
          Object.values(fragments.value).forEach((payload) => {
            if (isCriticalId(payload.id)) {
              applyFragmentEffects(payload)
            }
          })
        }

        const enqueuePayload = (payload: FragmentPayload) => {
          pending.set(payload.id, payload)
          queued.add(payload.id)
          requestedIds.delete(payload.id)
          requestedIds.delete(`refresh:${payload.id}`)
          scheduleFlush(isCriticalId(payload.id))
        }

        const queuePayload = (payload: FragmentPayload) => {
          if (!active) return
          const normalized = normalizePayload(payload)
          if (refreshIds.has(payload.id)) {
            refreshIds.delete(payload.id)
            refreshQueue.add(payload.id)
          }
          enqueuePayload(normalized)
        }

        const flushQueued = () => {
          microtaskFlushScheduled = false
          flushHandle = null
          if (!active || !queued.size) return
          const current = fragments.value
          let next: FragmentPayloadMap | null = null

          let hasLangRefresh = false
          let hasVisibleRefresh = false
          queued.forEach((id) => {
            const payload = pending.get(id)
            if (!payload) return
            pending.delete(id)
            if (refreshQueue.delete(id)) {
              hasLangRefresh = true
              if (visibleIds.has(id)) {
                hasVisibleRefresh = true
              }
            }
            if (current[id] === payload) return
            applyFragmentEffects(payload)
            next ??= { ...current }
            next[id] = payload
            const element = elementsById.get(id)
            if (element && observer && !FRAGMENT_STREAMING_ENABLED) {
              observer.unobserve(element)
              observed.delete(element)
              elementsById.delete(id)
              visibleIds.delete(id)
            }
          })

          queued.clear()

          if (next) {
            const nextValue = next
            if (shouldAnimateLangSwap && hasLangRefresh && hasVisibleRefresh && !langTransitionInFlight) {
              langTransitionInFlight = true
              void runLangViewTransition(
                () => {
                  fragments.value = nextValue
                  if (layoutTick) {
                    layoutTick.value += 1
                  }
                },
                {
                  mutationRoot: document.querySelector('[data-fragment-grid="main"]') ?? document.body,
                  timeoutMs: 320,
                  variant: 'fragments'
                }
              ).finally(() => {
                langTransitionInFlight = false
              })
            } else {
              fragments.value = nextValue
              if (layoutTick) {
                layoutTick.value += 1
              }
            }
          }
        }

        const scheduleFlush = (immediate = false) => {
          if (immediate) {
            if (flushHandle !== null) {
              window.cancelAnimationFrame(flushHandle)
              flushHandle = null
            }
            if (microtaskFlushScheduled) return
            microtaskFlushScheduled = true
            Promise.resolve().then(() => {
              flushQueued()
            })
            return
          }

          if (flushHandle !== null || microtaskFlushScheduled) return
          flushHandle = window.requestAnimationFrame(() => {
            flushQueued()
          })
        }

        const updateStatusFromRuntime = (nextStatus: FragmentRuntimeStatus) => {
          if (!active) return
          status.value = nextStatus === 'idle' ? 'idle' : 'streaming'
        }

        const updateWorkerSizing = (sizing: FragmentRuntimeCardSizing) => {
          if (!active) return
          workerSizing.value = {
            ...workerSizing.value,
            [sizing.fragmentId]: sizing
          }
        }

        const bridge = new FragmentRuntimeBridge()
        const connected = bridge.connect({
          clientId: buildRuntimeClientId(),
          apiBase: getPublicFragmentApiBase(),
          path,
          lang: activeLang,
          planEntries: normalizeRuntimePlanEntries(planValue),
          fetchGroups: normalizeRuntimeFetchGroups(planValue),
          initialFragments: langChanged ? [] : Object.values(resolveFragments(initialFragments) ?? {}),
          initialSizing: resolveInitialSizingSeeds(path, activeLang, planValue),
          visibleIds: canObserve ? [] : allIds,
          viewportWidth: window.innerWidth,
          enableStreaming: FRAGMENT_STREAMING_ENABLED,
          onCommit: queuePayload,
          onSizing: updateWorkerSizing,
          onStatus: updateStatusFromRuntime,
          onError: (message, fragmentIds) => {
            fragmentIds?.forEach((fragmentId) => {
              requestedIds.delete(fragmentId)
              requestedIds.delete(`refresh:${fragmentId}`)
            })
            console.error('Fragment runtime failed', message)
            status.value = 'error'
          }
        })
        const handlePageHide = () => {
          if (!connected) return
          bridge.suspendForPageHide()
        }

        const reportCardWidth = (element: HTMLElement) => {
          if (!connected) return
          const fragmentId = element.dataset.fragmentId
          if (!fragmentId) return
          const width = resolveCardWidth(element)
          if (width === null) return
          bridge.reportCardWidth(fragmentId, width)
        }

        const reportCardMeasurement = (fragmentId: string, element: HTMLElement, height: number) => {
          if (!connected || !Number.isFinite(height) || height <= 0) return
          const width = resolveCardWidth(element)
          bridge.measureCard(fragmentId, Math.round(height), width, element.dataset.fragmentReady === 'true')
        }

        const requestFragments = (ids: string[], priority: FragmentRuntimePriority) => {
          if (!active || !connected || !ids.length) return
          const required = new Set<string>()
          const stack = [...ids]

          while (stack.length) {
            const id = stack.pop()
            if (!id || required.has(id)) continue
            if (!entryById.has(id)) continue
            required.add(id)
            const deps = entryById.get(id)?.dependsOn ?? []
            deps.forEach((dep) => {
              if (!required.has(dep)) stack.push(dep)
            })
          }

          if (!required.size) return
          const ordered = planValue.fragments.map((entry) => entry.id).filter((id) => required.has(id))
          const refreshList = ordered.filter((id) => refreshIds.has(id))
          const fetchable = ordered.filter((id) => {
            const requestKey = refreshIds.has(id) ? `refresh:${id}` : id
            if (requestedIds.has(requestKey)) return false
            if (!refreshIds.has(id) && fragments.value[id]) return false
            if (!refreshIds.has(id) && pending.has(id)) return false
            return true
          })
          if (!fetchable.length) return

          fetchable.forEach((id) => {
            requestedIds.add(refreshIds.has(id) ? `refresh:${id}` : id)
          })

          recordFragmentStartupDebug({
            kind: 'fetch',
            shellMode,
            startupReady: true,
            ids: fetchable,
            nonCriticalIds: fetchable.filter((id) => !isCriticalId(id))
          })

          bridge.requestFragments(fetchable, {
            priority,
            refreshIds: refreshList
          })
        }

        const scheduleHmrRefresh = (payload?: FragmentHmrEventPayload) => {
          if (payload?.clearCaches) {
            hmrClearCachesPending = true
          }
          if (hmrTimer) {
            window.clearTimeout(hmrTimer)
          }
          hmrTimer = window.setTimeout(() => {
            hmrTimer = null
            if (hmrClearCachesPending) {
              hmrClearCachesPending = false
              clearFragmentPlanCache()
              clearFragmentShellCache(path)
            }
            planValue.fragments.forEach((entry) => refreshIds.add(entry.id))
            pending.clear()
            queued.clear()
            refreshQueue.clear()
            requestedIds.clear()
            bridge.refresh(planValue.fragments.map((entry) => entry.id))
          }, 75)
        }

        if (import.meta.hot) {
          import.meta.hot.on('fragments:refresh', scheduleHmrRefresh)
        }

        const handleStableHeight = (event: Event) => {
          const detail = (event as CustomEvent<{ fragmentId?: string; height?: number }>).detail
          const fragmentId = detail?.fragmentId?.trim()
          if (!fragmentId || typeof detail.height !== 'number') return
          const element =
            elementsById.get(fragmentId) ??
            document.querySelector<HTMLElement>(`[data-fragment-id="${CSS.escape(fragmentId)}"]`)
          if (!element) return
          reportCardMeasurement(fragmentId, element, detail.height)
        }

        document.addEventListener(STABLE_HEIGHT_EVENT, handleStableHeight as EventListener)
        window.addEventListener('pagehide', handlePageHide)

        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver((entries) => {
            entries.forEach((entry) => {
              const element = entry.target as HTMLElement
              const fragmentId = element.dataset.fragmentId
              if (!fragmentId) return
              reportCardWidth(element)
              if (element.dataset.fragmentReady === 'true') {
                reportCardMeasurement(fragmentId, element, Math.ceil(entry.contentRect.height))
              }
            })
          })
        }

        const observeTargets = () => {
          const elements = Array.from(document.querySelectorAll<HTMLElement>(FRAGMENT_SELECTOR))
          elements.forEach((element) => {
            if (observed.has(element)) return
            const id = element.dataset.fragmentId
            if (!id) return
            observer?.observe(element)
            resizeObserver?.observe(element)
            observed.add(element)
            elementsById.set(id, element)
            reportCardWidth(element)
          })
        }

        const promoteDynamicCritical = (ids: string[]) => {
          if (!active || !ids.length) return
          const newlyCritical = ids.filter((id) => entryById.has(id) && !dynamicCriticalSet.has(id))
          if (!newlyCritical.length) return
          newlyCritical.forEach((id) => {
            dynamicCriticalSet.add(id)
            const payload = fragments.value[id]
            if (payload) {
              applyFragmentEffects(payload)
            }
          })
          requestFragments(newlyCritical, 'critical')
        }

        if (dynamicCriticalSeed.length) {
          promoteDynamicCritical(dynamicCriticalSeed)
        }
        dynamicCriticalUpdater.value = promoteDynamicCritical

        if (canObserve) {
          observer = new IntersectionObserver(
            (entries) => {
              const ready: string[] = []
              let visibilityChanged = false
              entries.forEach((entry) => {
                const target = entry.target as HTMLElement
                const id = target.dataset.fragmentId
                if (!id) return
                if (entry.isIntersecting) {
                  visibilityChanged = !visibleIds.has(id) || visibilityChanged
                  visibleIds.add(id)
                  const existing = fragments.value[id]
                  if (existing && !isCriticalId(id)) {
                    applyFragmentEffects(existing)
                  }
                  ready.push(id)
                } else {
                  visibilityChanged = visibleIds.delete(id) || visibilityChanged
                }
              })
              if (ready.length) {
                requestFragments(ready, 'visible')
              }
              if (visibilityChanged) {
                bridge.setVisibleIds(Array.from(visibleIds))
              }
            },
            { rootMargin: FRAGMENT_ROOT_MARGIN, threshold: FRAGMENT_THRESHOLD }
          )

          observeTargets()
        }

        if (hasMissingCriticalFragments) {
          requestFragments(Array.from(staticCriticalIds), 'critical')
        }

        if (!canObserve) {
          requestFragments(allIds, 'visible')
          bridge.setVisibleIds(allIds)
        }

        ctx.cleanup(() => {
          active = false
          dynamicCriticalUpdater.value = null
          bridge.dispose()
          observer?.disconnect()
          resizeObserver?.disconnect()
          pending.clear()
          visibleIds.clear()
          queued.clear()
          requestedIds.clear()
          elementsById.clear()
          document.removeEventListener(STABLE_HEIGHT_EVENT, handleStableHeight as EventListener)
          window.removeEventListener('pagehide', handlePageHide)
          if (flushHandle !== null) {
            window.cancelAnimationFrame(flushHandle)
            flushHandle = null
          }
          microtaskFlushScheduled = false
          if (hmrTimer) {
            window.clearTimeout(hmrTimer)
            hmrTimer = null
          }
          if (import.meta.hot) {
            import.meta.hot.off('fragments:refresh', scheduleHmrRefresh)
          }
          if (!preserveFragmentEffects) {
            teardownFragmentEffects(Object.keys(fragments.value))
          }
        })
      },
      { strategy: 'document-ready' }
    )

    useVisibleTask$(
      (ctx) => {
        const ids = ctx.track(() => dynamicCriticalIds?.value ?? [])
        if (!ids.length) return
        dynamicCriticalUpdater.value?.(ids)
      },
      { strategy: 'document-ready' }
    )

    return null
  }
)
