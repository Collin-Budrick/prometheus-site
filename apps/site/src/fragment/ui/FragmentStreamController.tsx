import { component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import type { Signal } from '@builder.io/qwik'
import {
  applyFragmentEffects,
  fetchFragment,
  fetchFragmentBatch,
  streamFragments,
  teardownFragmentEffects
} from '../client'
import type {
  FragmentPayload,
  FragmentPayloadMap,
  FragmentPayloadValue,
  FragmentPlanValue
} from '../types'
import { useSharedLangSignal } from '../../shared/lang-bridge'
import { runLangViewTransition } from '../../shared/view-transitions'
import { appConfig } from '../../app-config'
import { resolveFragments, resolvePlan } from './utils'
import type { Lang } from '../../shared/lang-store'

const FRAGMENT_SELECTOR = '[data-fragment-id]'
const FRAGMENT_ROOT_MARGIN = appConfig.fragmentVisibilityMargin
const FRAGMENT_THRESHOLD = appConfig.fragmentVisibilityThreshold
const FRAGMENT_STREAMING_ENABLED = appConfig.enableFragmentStreaming

type FragmentStreamControllerProps = {
  plan: FragmentPlanValue
  initialFragments: FragmentPayloadValue
  path: string
  fragments: Signal<FragmentPayloadMap>
  status: Signal<'idle' | 'streaming' | 'error'>
  paused?: Signal<boolean> | boolean
  preserveFragmentEffects?: boolean
  initialLang?: Lang
  dynamicCriticalIds?: Signal<string[]>
}

export const FragmentStreamController = component$(
  ({
    plan,
    initialFragments,
    path,
    fragments,
    status,
    paused,
    preserveFragmentEffects,
    initialLang,
    dynamicCriticalIds
  }: FragmentStreamControllerProps) => {
    const langSignal = useSharedLangSignal()
    const lastLang = useSignal<string | null>(initialLang ?? null)
    const dynamicCriticalUpdater = useSignal<((ids: string[]) => void) | null>(null)

    useVisibleTask$(
      (ctx) => {
        let active = true
        const isPaused = ctx.track(() =>
          typeof paused === 'boolean' ? paused : paused ? paused.value : false
        )
        const streamController = FRAGMENT_STREAMING_ENABLED ? new AbortController() : null
        const fetchControllers = new Set<AbortController>()
        const inFlight = new Set<string>()
        const pending = new Map<string, FragmentPayload>()
        const deferred = new Map<string, FragmentPayload>()
        const queued = new Set<string>()
        const observed = new WeakSet<Element>()
        const elementsById = new Map<string, HTMLElement>()
        const visibleIds = new Set<string>()
        let observer: IntersectionObserver | null = null
        let observeTargets = () => {}
        let flushHandle: number | null = null
        let hmrTimer: number | null = null
        const activeLang = ctx.track(() => langSignal.value)
        const langChanged = lastLang.value !== null && lastLang.value !== activeLang
        lastLang.value = activeLang
        const refreshIds = new Set<string>()
        const refreshQueue = new Set<string>()
        const shouldAnimateLangSwap = langChanged
        let langTransitionInFlight = false
        const canObserve = 'IntersectionObserver' in window

        const registerFetchController = () => {
          const ctrl = new AbortController()
          fetchControllers.add(ctrl)
          return ctrl
        }

        const finalizeFetchController = (ctrl: AbortController) => {
          fetchControllers.delete(ctrl)
        }

        if (!fragments.value || !Object.keys(fragments.value).length) {
          fragments.value = resolveFragments(initialFragments) ?? {}
        }

        if (isPaused) {
          status.value = 'idle'
          ctx.cleanup(() => {
            active = false
          })
          return
        }

        const planValue = resolvePlan(plan)
        if (langChanged) {
          planValue.fragments.forEach((entry) => refreshIds.add(entry.id))
        }
        const entryById = new Map(planValue.fragments.map((entry) => [entry.id, entry]))
        const allIds = planValue.fragments.map((entry) => entry.id)
        const staticCriticalIds = new Set(planValue.fragments.filter((entry) => entry.critical).map((entry) => entry.id))
        const dynamicCriticalSeed = dynamicCriticalIds?.value ?? []
        const dynamicCriticalSet = new Set<string>()
        const isCriticalId = (id: string) => staticCriticalIds.has(id) || dynamicCriticalSet.has(id)
        const shouldDeferOffscreen = FRAGMENT_STREAMING_ENABLED && canObserve

        if (!canObserve) {
          Object.values(fragments.value).forEach((payload) => applyFragmentEffects(payload))
        } else {
          Object.values(fragments.value).forEach((payload) => {
            if (isCriticalId(payload.id)) {
              applyFragmentEffects(payload)
            }
          })
        }

        const scheduleIdle = (callback: () => void) => {
          const idleApi = window as {
            requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
            cancelIdleCallback?: (handle: number) => void
          }

          if (idleApi.requestIdleCallback) {
            const handle = idleApi.requestIdleCallback(callback, { timeout: 1200 })
            return () => {
              idleApi.cancelIdleCallback?.(handle)
            }
          }
          const handle = window.setTimeout(callback, 180)
          return () => window.clearTimeout(handle)
        }

        const enqueuePayload = (payload: FragmentPayload) => {
          pending.set(payload.id, payload)
          queued.add(payload.id)
          scheduleFlush()
        }

        const releaseDeferred = (ids?: string[]) => {
          const targets = ids ?? Array.from(deferred.keys())
          targets.forEach((id) => {
            const payload = deferred.get(id)
            if (!payload) return
            deferred.delete(id)
            enqueuePayload(payload)
          })
        }

        let idleCancel: (() => void) | null = null

        const scheduleIdleRelease = () => {
          if (idleCancel) return
          idleCancel = scheduleIdle(() => {
            idleCancel = null
            if (!active) return
            if (FRAGMENT_STREAMING_ENABLED) {
              releaseDeferred()
              return
            }
            const idleIds = allIds.filter((id) => {
              if (isCriticalId(id)) return false
              if (visibleIds.has(id)) return false
              if (fragments.value[id] && !refreshIds.has(id)) return false
              if (inFlight.has(id) || pending.has(id) || deferred.has(id)) return false
              return true
            })
            if (idleIds.length) {
              requestFragments(idleIds)
            }
          })
        }

        const queuePayload = (payload: FragmentPayload) => {
          if (!active) return
          if (refreshIds.has(payload.id)) {
            refreshIds.delete(payload.id)
            refreshQueue.add(payload.id)
          }
          if (shouldDeferOffscreen && !isCriticalId(payload.id) && !visibleIds.has(payload.id)) {
            deferred.set(payload.id, payload)
            scheduleIdleRelease()
            return
          }
          enqueuePayload(payload)
        }

        const flushQueued = () => {
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
            }
          }
        }

        const scheduleFlush = () => {
          if (flushHandle !== null) return
          flushHandle = window.requestAnimationFrame(() => {
            flushQueued()
          })
        }

        const setStreaming = () => {
          if (!active) return
          status.value = 'streaming'
        }

        const markIdle = () => {
          if (!active) return
          if (!inFlight.size && status.value !== 'error') {
            status.value = 'idle'
          }
        }

        const markAllForRefresh = () => {
          planValue.fragments.forEach((entry) => refreshIds.add(entry.id))
        }

        const scheduleHmrRefresh = () => {
          if (hmrTimer) {
            window.clearTimeout(hmrTimer)
          }
          hmrTimer = window.setTimeout(() => {
            hmrTimer = null
            markAllForRefresh()
            if (!observer) {
              requestFragments(planValue.fragments.map((entry) => entry.id))
              return
            }
            observeTargets()
            if (visibleIds.size) {
              requestFragments(Array.from(visibleIds))
            }
          }, 75)
        }

        if (import.meta.hot) {
          import.meta.hot.on('fragments:refresh', scheduleHmrRefresh)
        }

        const fetchMissing = (ids: string[]) => {
          const fetchable = ids.filter((id) => {
            const needsRefresh = refreshIds.has(id)
            if (!needsRefresh && fragments.value[id]) return false
            if (inFlight.has(id)) return false
            if (!needsRefresh && pending.has(id)) return false
            return true
          })
          if (!fetchable.length) return

          fetchable.forEach((id) => {
            inFlight.add(id)
          })

          const batchable = fetchable.map((id) => ({ id, refresh: refreshIds.has(id) }))
          const useBatch = batchable.length > 1
          setStreaming()

          const handlePayload = (payload: FragmentPayload) => {
            if (!active) return
            queuePayload(payload)
          }

          const handleError = (error: unknown) => {
            if (!active) return
            if ((error as Error)?.name === 'AbortError') return
            console.error('Fragment fetch failed', error)
            status.value = 'error'
          }

          const handleFinally = (idsToClear: string[]) => {
            idsToClear.forEach((id) => inFlight.delete(id))
            markIdle()
          }

          if (useBatch) {
            const batchController = registerFetchController()
            fetchFragmentBatch(batchable, { lang: activeLang, signal: batchController.signal })
              .then((payloads) => {
                Object.values(payloads).forEach(handlePayload)
              })
              .catch(handleError)
              .finally(() => {
                finalizeFetchController(batchController)
                handleFinally(batchable.map((entry) => entry.id))
              })
            return
          }

          const entry = batchable[0]
          const fragmentController = registerFetchController()
          fetchFragment(entry.id, { lang: activeLang, refresh: entry.refresh, signal: fragmentController.signal })
            .then(handlePayload)
            .catch(handleError)
            .finally(() => {
              finalizeFetchController(fragmentController)
              handleFinally([entry.id])
            })
        }

        const requestFragments = (ids: string[]) => {
          if (!active || !ids.length) return
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
          fetchMissing(Array.from(required))
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
          releaseDeferred(newlyCritical)
          if (!FRAGMENT_STREAMING_ENABLED) {
            requestFragments(newlyCritical)
          }
        }

        if (dynamicCriticalSeed.length) {
          promoteDynamicCritical(dynamicCriticalSeed)
        }
        dynamicCriticalUpdater.value = promoteDynamicCritical

        if (FRAGMENT_STREAMING_ENABLED && streamController) {
          setStreaming()
          streamFragments(path, (payload) => queuePayload(payload), undefined, streamController.signal, activeLang)
            .then(() => {
              if (!active) return
              const missing = allIds.filter((id) => !fragments.value[id] && !pending.has(id) && !deferred.has(id))
              if (missing.length) {
                requestFragments(missing)
              }
              markIdle()
            })
            .catch((error) => {
              if (!active) return
              if ((error as Error)?.name === 'AbortError' || streamController.signal.aborted) {
                markIdle()
                return
              }
              console.error('Fragment stream failed', error)
              status.value = 'error'
              const fallback = allIds.filter((id) => !fragments.value[id] && !pending.has(id) && !deferred.has(id))
              if (fallback.length) {
                requestFragments(fallback)
              }
            })
        }

        if (canObserve) {
          observer = new IntersectionObserver(
            (entries) => {
              const ready: string[] = []
              entries.forEach((entry) => {
                const target = entry.target as HTMLElement
                const id = target.dataset.fragmentId
                if (!id) return
                if (entry.isIntersecting) {
                  visibleIds.add(id)
                  const existing = fragments.value[id]
                  if (existing && !isCriticalId(id)) {
                    applyFragmentEffects(existing)
                  }
                  ready.push(id)
                } else {
                  visibleIds.delete(id)
                }
              })
              if (ready.length) {
                if (!FRAGMENT_STREAMING_ENABLED) {
                  requestFragments(ready)
                }
                releaseDeferred(ready)
              }
            },
            { rootMargin: FRAGMENT_ROOT_MARGIN, threshold: FRAGMENT_THRESHOLD }
          )

          observeTargets = () => {
            const elements = Array.from(document.querySelectorAll<HTMLElement>(FRAGMENT_SELECTOR))
            elements.forEach((element) => {
              if (observed.has(element)) return
              const id = element.dataset.fragmentId
              if (!id) return
              if (!FRAGMENT_STREAMING_ENABLED && fragments.value[id] && !refreshIds.has(id)) return
              observer?.observe(element)
              observed.add(element)
              elementsById.set(id, element)
            })
          }

          observeTargets()
        }

        if (!FRAGMENT_STREAMING_ENABLED) {
          if (!canObserve) {
            requestFragments(allIds)
            ctx.cleanup(() => {
              active = false
              if (!preserveFragmentEffects) {
                teardownFragmentEffects(Object.keys(fragments.value))
              }
            })
            return
          }
          requestFragments(Array.from(staticCriticalIds))
        }

        if (canObserve || shouldDeferOffscreen) {
          scheduleIdleRelease()
        }

        ctx.cleanup(() => {
          active = false
          dynamicCriticalUpdater.value = null
          streamController?.abort()
          fetchControllers.forEach((ctrl) => ctrl.abort())
          fetchControllers.clear()
          observer?.disconnect()
          inFlight.clear()
          pending.clear()
          deferred.clear()
          visibleIds.clear()
          queued.clear()
          if (flushHandle !== null) {
            window.cancelAnimationFrame(flushHandle)
            flushHandle = null
          }
          elementsById.clear()
          if (hmrTimer) {
            window.clearTimeout(hmrTimer)
            hmrTimer = null
          }
          if (idleCancel) {
            idleCancel()
            idleCancel = null
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
