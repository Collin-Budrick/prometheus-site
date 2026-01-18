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
import { resolveFragments, resolvePlan } from './utils'

const FRAGMENT_SELECTOR = '[data-fragment-id]'
const FRAGMENT_ROOT_MARGIN = '60% 0px'
const FRAGMENT_THRESHOLD = 0.01
const STREAM_FALLBACK_DELAY = 450
const STREAM_STALL_TIMEOUT = 900

type FragmentStreamControllerProps = {
  plan: FragmentPlanValue
  initialFragments: FragmentPayloadValue
  path: string
  fragments: Signal<FragmentPayloadMap>
  status: Signal<'idle' | 'streaming' | 'error'>
  paused?: Signal<boolean> | boolean
}

export const FragmentStreamController = component$(
  ({ plan, initialFragments, path, fragments, status, paused }: FragmentStreamControllerProps) => {
    const langSignal = useSharedLangSignal()
    const lastLang = useSignal<string | null>(null)

    useVisibleTask$(
      (ctx) => {
        let active = true
        const isPaused = ctx.track(() =>
          typeof paused === 'boolean' ? paused : paused ? paused.value : false
        )
        const streamController = new AbortController()
        const fetchControllers = new Set<AbortController>()
        const inFlight = new Set<string>()
        const needed = new Set<string>()
        const pending = new Map<string, FragmentPayload>()
        const fallbackTimers = new Map<string, number>()
        const fallbackCandidates = new Set<string>()
        let fallbackArmed = false
        let fallbackStallTimer: number | null = null
        let hmrTimer: number | null = null
        const observed = new WeakSet<Element>()
        const elementsById = new Map<string, HTMLElement>()
        let observer: IntersectionObserver | null = null
        let streamActive = false
        let streamDone = false
        let flushHandle: number | null = null
        const queued = new Set<string>()
        const activeLang = ctx.track(() => langSignal.value)
        const langChanged = lastLang.value !== null && lastLang.value !== activeLang
        lastLang.value = activeLang
        const refreshIds = new Set<string>()
        const shouldAnimateLangSwap = langChanged
        let langTransitionInFlight = false
        let streamReceivedFrame = false
        let stalledBeforeFirstFrame = false

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

        Object.keys(fragments.value).forEach((id) => needed.add(id))
        Object.values(fragments.value).forEach((payload) => applyFragmentEffects(payload))

        if (isPaused) {
          status.value = 'idle'
          ctx.cleanup(() => {
            active = false
          })
          return
        }

        const planValue = resolvePlan(plan)
        const refreshAllIds = langChanged ? planValue.fragments.map((entry) => entry.id) : []
        const refreshAllSet = new Set(refreshAllIds)
        if (refreshAllIds.length) {
          refreshAllIds.forEach((id) => refreshIds.add(id))
          status.value = 'streaming'
        }
        const entryById = new Map(planValue.fragments.map((entry) => [entry.id, entry]))
        planValue.fragments.forEach((entry) => needed.add(entry.id))

        const applyPayload = (payload: FragmentPayload) => {
          if (!active) return
          const timer = fallbackTimers.get(payload.id)
          if (timer) {
            window.clearTimeout(timer)
            fallbackTimers.delete(payload.id)
          }
          fallbackCandidates.delete(payload.id)
          refreshIds.delete(payload.id)
          pending.set(payload.id, payload)
          queued.add(payload.id)
          scheduleFlush()
        }

        const flushQueued = () => {
          flushHandle = null
          if (!active || !queued.size) return
          const current = fragments.value
          let next: FragmentPayloadMap | null = null

          let hasLangRefresh = false
          queued.forEach((id) => {
            const payload = pending.get(id)
            if (!payload || current[id] === payload) return
            if (refreshAllSet.has(id)) {
              hasLangRefresh = true
            }
            applyFragmentEffects(payload)
            next ??= { ...current }
            next[id] = payload
            const element = elementsById.get(id)
            if (element && observer) {
              observer.unobserve(element)
              observed.delete(element)
              elementsById.delete(id)
            }
          })

          queued.clear()

          if (next) {
            if (shouldAnimateLangSwap && hasLangRefresh && !langTransitionInFlight) {
              langTransitionInFlight = true
              void runLangViewTransition(
                () => {
                  fragments.value = next
                },
                {
                  mutationRoot: document.querySelector('.fragment-grid') ?? document.body,
                  timeoutMs: 320,
                  variant: 'fragments'
                }
              ).finally(() => {
                langTransitionInFlight = false
              })
            } else {
              fragments.value = next
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
          if (!streamActive && !inFlight.size && status.value !== 'error') {
            status.value = 'idle'
          }
        }

        const applyPending = (id: string) => {
          const payload = pending.get(id)
          if (!payload) return false
          pending.delete(id)
          applyPayload(payload)
          return true
        }

        const refreshFragments = () => {
          if (!active) return
          const ids = planValue.fragments.map((entry) => entry.id)
          if (!ids.length) return
          setStreaming()
          ids.forEach((id) => {
            if (inFlight.has(id)) return
            inFlight.add(id)
            const refreshController = registerFetchController()
            fetchFragment(id, { refresh: true, lang: activeLang, signal: refreshController.signal })
              .then((payload) => {
                if (!active) return
                applyPayload(payload)
              })
              .catch((error) => {
                if (!active) return
                if ((error as Error)?.name === 'AbortError') return
                console.error('Fragment refresh failed', error)
                status.value = 'error'
              })
              .finally(() => {
                finalizeFetchController(refreshController)
                inFlight.delete(id)
                markIdle()
              })
          })
        }

        const scheduleHmrRefresh = () => {
          if (hmrTimer) {
            window.clearTimeout(hmrTimer)
          }
          hmrTimer = window.setTimeout(() => {
            hmrTimer = null
            refreshFragments()
          }, 75)
        }

        if (import.meta.hot) {
          import.meta.hot.on('fragments:refresh', scheduleHmrRefresh)
        }

        const fetchMissing = (ids: string[]) => {
          const fetchable = ids.filter((id) => {
            const needsRefresh = refreshIds.has(id)
            if ((!needsRefresh && fragments.value[id]) || inFlight.has(id) || pending.has(id)) return false
            return true
          })
          if (!fetchable.length) return

          fetchable.forEach((id) => {
            const timer = fallbackTimers.get(id)
            if (timer) {
              window.clearTimeout(timer)
              fallbackTimers.delete(id)
            }
            inFlight.add(id)
          })

          const batchable = fetchable.map((id) => ({ id, refresh: refreshIds.has(id) }))
          const useBatch = batchable.length > 1
          setStreaming()

          const handlePayload = (payload: FragmentPayload) => {
            if (!active) return
            applyPayload(payload)
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

        const scheduleFallbackForId = (id: string) => {
          if (fallbackTimers.has(id)) return
          const run = () => {
            fallbackTimers.delete(id)
            if (!active) return
            if (streamActive && !streamDone && !stalledBeforeFirstFrame) {
              const retry = window.setTimeout(run, STREAM_FALLBACK_DELAY)
              fallbackTimers.set(id, retry)
              return
            }
            const needsRefresh = refreshIds.has(id)
            if ((!needsRefresh && fragments.value[id]) || pending.has(id) || inFlight.has(id)) return
            fallbackCandidates.delete(id)
            fetchMissing([id])
          }
          const timer = window.setTimeout(run, STREAM_FALLBACK_DELAY)
          fallbackTimers.set(id, timer)
        }

        const schedulePendingFallbacks = () => {
          fallbackCandidates.forEach((id) => {
            if (refreshIds.has(id) || !fragments.value[id] || pending.has(id)) {
              scheduleFallbackForId(id)
            }
            fallbackCandidates.delete(id)
          })
        }

        const armFallbacks = () => {
          if (fallbackArmed) return
          fallbackArmed = true
          schedulePendingFallbacks()
        }

        const startFallbackStallTimer = () => {
          if (fallbackStallTimer || fallbackArmed) return
          fallbackStallTimer = window.setTimeout(() => {
            fallbackStallTimer = null
            if (!active || streamReceivedFrame) return
            stalledBeforeFirstFrame = true
            armFallbacks()
          }, STREAM_STALL_TIMEOUT)
        }

        const fetchMissingNeeded = () => {
          const missing = Array.from(needed).filter(
            (id) => (refreshIds.has(id) || !fragments.value[id]) && !pending.has(id)
          )
          if (!missing.length) return
          missing.forEach((id) => fallbackCandidates.delete(id))
          fetchMissing(missing)
        }

        const startStream = () => {
          if (!active || streamActive || streamDone) return
          streamActive = true
          streamReceivedFrame = false
          stalledBeforeFirstFrame = false
          setStreaming()
          startFallbackStallTimer()

          const handleFragment = (payload: FragmentPayload) => {
            if (!active) return
            if (!streamReceivedFrame) {
              streamReceivedFrame = true
              if (fallbackStallTimer) {
                window.clearTimeout(fallbackStallTimer)
                fallbackStallTimer = null
              }
              armFallbacks()
            }
            refreshIds.delete(payload.id)
            pending.set(payload.id, payload)
            if (needed.has(payload.id)) {
              applyPending(payload.id)
            }
          }

          streamFragments(path, handleFragment, undefined, streamController.signal, activeLang)
            .then(() => {
              streamActive = false
              streamDone = true
              if (fallbackStallTimer) {
                window.clearTimeout(fallbackStallTimer)
                fallbackStallTimer = null
              }
              markIdle()
              fetchMissingNeeded()
            })
            .catch((error) => {
              streamActive = false
              streamDone = true
              if (fallbackStallTimer) {
                window.clearTimeout(fallbackStallTimer)
                fallbackStallTimer = null
              }
              if (!active) return
              if ((error as Error)?.name === 'AbortError' || streamController.signal.aborted) {
                markIdle()
                return
              }
              console.error('Fragment stream failed', error)
              status.value = 'error'
              fetchMissingNeeded()
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

          const missing: string[] = []
          required.forEach((id) => {
            needed.add(id)
            if (applyPending(id)) return
            if (refreshIds.has(id) || !fragments.value[id]) {
              missing.push(id)
            }
          })

          if (!missing.length) return

          if (streamDone) {
            fetchMissing(missing)
            return
          }

          startStream()
          missing.forEach((id) => {
            if (fallbackArmed) {
              scheduleFallbackForId(id)
            } else {
              fallbackCandidates.add(id)
            }
          })
        }

        const fallbackIds = planValue.fragments.map((entry) => entry.id)
        if (!('IntersectionObserver' in window)) {
          requestFragments(refreshAllIds.length ? refreshAllIds : fallbackIds)
          ctx.cleanup(() => {
            active = false
            teardownFragmentEffects(Object.keys(fragments.value))
          })
          return
        }

        observer = new IntersectionObserver(
          (entries) => {
            const ready: string[] = []
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return
              const target = entry.target as HTMLElement
              const id = target.dataset.fragmentId
              if (!id) return
              ready.push(id)
            })
            if (ready.length) {
              requestFragments(ready)
            }
          },
          { rootMargin: FRAGMENT_ROOT_MARGIN, threshold: FRAGMENT_THRESHOLD }
        )

        const observeTargets = () => {
          const elements = Array.from(document.querySelectorAll<HTMLElement>(FRAGMENT_SELECTOR))
          elements.forEach((element) => {
            if (observed.has(element)) return
            const id = element.dataset.fragmentId
            if (!id) return
            if (fragments.value[id] && !refreshIds.has(id)) return
            observer?.observe(element)
            observed.add(element)
            elementsById.set(id, element)
          })
        }

        observeTargets()
        if (refreshAllIds.length) {
          requestFragments(refreshAllIds)
        }

        ctx.cleanup(() => {
          active = false
          streamController.abort()
          fetchControllers.forEach((ctrl) => ctrl.abort())
          fetchControllers.clear()
          observer?.disconnect()
          inFlight.clear()
          needed.clear()
          pending.clear()
          fallbackTimers.forEach((timer) => window.clearTimeout(timer))
          fallbackTimers.clear()
          fallbackCandidates.clear()
          if (fallbackStallTimer) {
            window.clearTimeout(fallbackStallTimer)
            fallbackStallTimer = null
          }
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
          if (import.meta.hot) {
            import.meta.hot.off('fragments:refresh', scheduleHmrRefresh)
          }
          teardownFragmentEffects(Object.keys(fragments.value))
        })
      },
      { strategy: 'document-ready' }
    )

    return null
  }
)
