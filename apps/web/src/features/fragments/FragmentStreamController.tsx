import { component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import type { Signal } from '@builder.io/qwik'
import {
  applyFragmentEffects,
  fetchFragment,
  fetchFragmentBatch,
  streamFragments,
  teardownFragmentEffects
} from '../../fragment/client'
import type {
  FragmentPayload,
  FragmentPayloadMap,
  FragmentPayloadValue,
  FragmentPlanValue
} from '../../fragment/types'
import { useSharedLangSignal } from '../../shared/lang-bridge'
import { runLangViewTransition } from '../../shared/view-transitions'
import { resolveFragments, resolvePlan } from './utils'

const FRAGMENT_SELECTOR = '[data-fragment-id]'
const FRAGMENT_ROOT_MARGIN = '60% 0px'
const FRAGMENT_THRESHOLD = 0.01
const STREAM_FALLBACK_DELAY = 450

type FragmentStreamControllerProps = {
  plan: FragmentPlanValue
  initialFragments: FragmentPayloadValue
  path: string
  fragments: Signal<FragmentPayloadMap>
  status: Signal<'idle' | 'streaming' | 'error'>
}

export const FragmentStreamController = component$(
  ({ plan, initialFragments, path, fragments, status }: FragmentStreamControllerProps) => {
    const langSignal = useSharedLangSignal()
    const lastLang = useSignal<string | null>(null)

    useVisibleTask$(
      ({ cleanup, track }) => {
        let active = true
        const controller = new AbortController()
        const inFlight = new Set<string>()
        const needed = new Set<string>()
        const pending = new Map<string, FragmentPayload>()
        const fallbackTimers = new Map<string, number>()
        let hmrTimer: number | null = null
        const observed = new WeakSet<Element>()
        const elementsById = new Map<string, HTMLElement>()
        let observer: IntersectionObserver | null = null
        let streamActive = false
        let streamDone = false
        let flushHandle: number | null = null
        const queued = new Set<string>()
        const activeLang = track(() => langSignal.value)
        const langChanged = lastLang.value !== null && lastLang.value !== activeLang
        lastLang.value = activeLang
        const refreshIds = new Set<string>()
        const shouldAnimateLangSwap = langChanged
        let langTransitionInFlight = false

        if (!fragments.value || !Object.keys(fragments.value).length) {
          fragments.value = resolveFragments(initialFragments) ?? {}
        }

        Object.keys(fragments.value).forEach((id) => needed.add(id))
        Object.values(fragments.value).forEach((payload) => applyFragmentEffects(payload))

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
            fetchFragment(id, { refresh: true, lang: activeLang })
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
            fetchFragmentBatch(batchable, { lang: activeLang })
              .then((payloads) => {
                Object.values(payloads).forEach(handlePayload)
              })
              .catch(handleError)
              .finally(() => {
                handleFinally(batchable.map((entry) => entry.id))
              })
            return
          }

          const entry = batchable[0]
          fetchFragment(entry.id, { lang: activeLang, refresh: entry.refresh })
            .then(handlePayload)
            .catch(handleError)
            .finally(() => handleFinally([entry.id]))
        }

        const fetchMissingNeeded = () => {
          const missing = Array.from(needed).filter(
            (id) => (refreshIds.has(id) || !fragments.value[id]) && !pending.has(id)
          )
          if (!missing.length) return
          fetchMissing(missing)
        }

        const startStream = () => {
          if (!active || streamActive || streamDone) return
          streamActive = true
          setStreaming()

          const handleFragment = (payload: FragmentPayload) => {
            if (!active) return
            refreshIds.delete(payload.id)
            pending.set(payload.id, payload)
            if (needed.has(payload.id)) {
              applyPending(payload.id)
            }
          }

          streamFragments(path, handleFragment, undefined, controller.signal, activeLang)
            .then(() => {
              streamActive = false
              streamDone = true
              markIdle()
              fetchMissingNeeded()
            })
            .catch((error) => {
              streamActive = false
              streamDone = true
              if (!active) return
              if ((error as Error)?.name === 'AbortError' || controller.signal.aborted) {
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
            if (fallbackTimers.has(id)) return
            const timer = window.setTimeout(() => {
              fallbackTimers.delete(id)
              if (!active) return
              const needsRefresh = refreshIds.has(id)
              if ((!needsRefresh && fragments.value[id]) || pending.has(id) || inFlight.has(id)) return
              fetchMissing([id])
            }, STREAM_FALLBACK_DELAY)
            fallbackTimers.set(id, timer)
          })
        }

        const fallbackIds = planValue.fragments.map((entry) => entry.id)
        if (!('IntersectionObserver' in window)) {
          requestFragments(refreshAllIds.length ? refreshAllIds : fallbackIds)
          cleanup(() => {
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

        cleanup(() => {
          active = false
          controller.abort()
          observer?.disconnect()
          inFlight.clear()
          needed.clear()
          pending.clear()
          fallbackTimers.forEach((timer) => window.clearTimeout(timer))
          fallbackTimers.clear()
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
