import { component$, useVisibleTask$ } from '@builder.io/qwik'
import type { Signal } from '@builder.io/qwik'
import { applyFragmentEffects, fetchFragment, teardownFragmentEffects } from '../../fragment/client'
import type {
  FragmentPayload,
  FragmentPayloadMap,
  FragmentPayloadValue,
  FragmentPlanValue
} from '../../fragment/types'
import { resolveFragments, resolvePlan } from './utils'

const FRAGMENT_SELECTOR = '[data-fragment-id]'
const FRAGMENT_ROOT_MARGIN = '30% 0px'
const FRAGMENT_THRESHOLD = 0.01

type FragmentStreamControllerProps = {
  plan: FragmentPlanValue
  initialFragments: FragmentPayloadValue
  path: string
  fragments: Signal<FragmentPayloadMap>
  status: Signal<'idle' | 'streaming' | 'error'>
}

export const FragmentStreamController = component$(
  ({ plan, initialFragments, fragments, status }: FragmentStreamControllerProps) => {
    useVisibleTask$(
      ({ cleanup }) => {
        let active = true
        const inFlight = new Set<string>()
        const observed = new WeakSet<Element>()
        const elementsById = new Map<string, HTMLElement>()
        let observer: IntersectionObserver | null = null

        if (!fragments.value || !Object.keys(fragments.value).length) {
          fragments.value = resolveFragments(initialFragments) ?? {}
        }

        Object.values(fragments.value).forEach((payload) => applyFragmentEffects(payload))

        const planValue = resolvePlan(plan)
        const entryById = new Map(planValue.fragments.map((entry) => [entry.id, entry]))

        const applyPayload = (payload: FragmentPayload) => {
          if (!active) return
          applyFragmentEffects(payload)
          const update = () => {
            const current = fragments.value
            if (current[payload.id] === payload) return
            const next = structuredClone(current)
            next[payload.id] = payload
            fragments.value = next
            const element = elementsById.get(payload.id)
            if (element && observer) {
              observer.unobserve(element)
              observed.delete(element)
              elementsById.delete(payload.id)
            }
          }
          const startTransition = document.startViewTransition
          if (typeof startTransition === 'function') {
            startTransition.call(document, update)
          } else {
            update()
          }
        }

        const markIdle = () => {
          if (!active) return
          if (!inFlight.size && status.value !== 'error') {
            status.value = 'idle'
          }
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

          planValue.fragments.forEach((entry) => {
            if (!required.has(entry.id)) return
            if (fragments.value[entry.id] || inFlight.has(entry.id)) return
            inFlight.add(entry.id)
            status.value = 'streaming'
            fetchFragment(entry.id)
              .then((payload) => {
                if (!active) return
                applyPayload(payload)
              })
              .catch((error) => {
                if (!active) return
                if ((error as Error)?.name === 'AbortError') return
                console.error('Fragment fetch failed', error)
                status.value = 'error'
              })
              .finally(() => {
                inFlight.delete(entry.id)
                markIdle()
              })
          })
        }

        if (!('IntersectionObserver' in window)) {
          requestFragments(planValue.fragments.map((entry) => entry.id))
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
            if (fragments.value[id]) return
            observer?.observe(element)
            observed.add(element)
            elementsById.set(id, element)
          })
        }

        observeTargets()

        cleanup(() => {
          active = false
          observer?.disconnect()
          inFlight.clear()
          elementsById.clear()
          teardownFragmentEffects(Object.keys(fragments.value))
        })
      },
      { strategy: 'document-ready' }
    )

    return null
  }
)
