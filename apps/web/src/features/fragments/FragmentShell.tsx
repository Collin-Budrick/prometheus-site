import { $, component$, useComputed$, useOnDocument, useSignal, useTask$, useVisibleTask$ } from '@builder.io/qwik'
import { FragmentCard } from '@prometheus/ui'
import type { FragmentPayloadMap, FragmentPayloadValue, FragmentPlan, FragmentPlanValue } from '../../fragment/types'
import { applySpeculationRules, buildSpeculationRulesForPlan } from '../../shared/speculation'
import { isPrefetchEnabled } from '../../shared/prefetch'
import { useSharedFragmentStatusSignal } from '../../shared/fragment-status'
import { useLangCopy, useSharedLangSignal } from '../../shared/lang-bridge'
import type { Lang } from '../../shared/lang-store'
import { getFragmentHeaderCopy } from '../../shared/fragment-copy'
import { FragmentRenderer } from './FragmentRenderer'
import { FragmentStreamController } from './FragmentStreamController'
import { applyHeaderOverride } from './header-overrides'
import { resolveFragments, resolvePlan } from './utils'

type FragmentShellProps = {
  plan: FragmentPlanValue
  initialFragments: FragmentPayloadValue
  path: string
  initialLang: Lang
}

type FragmentClientEffectsProps = {
  planValue: FragmentPlan
  initialFragmentMap: FragmentPayloadMap
}

const DESKTOP_MIN_WIDTH = 1025

const FragmentClientEffects = component$(({ planValue, initialFragmentMap }: FragmentClientEffectsProps) => {
  useVisibleTask$(
    ({ cleanup }) => {
      if (!isPrefetchEnabled(import.meta.env)) return

      const teardownSpeculation = applySpeculationRules(
        buildSpeculationRulesForPlan(planValue, import.meta.env, {
          knownFragments: initialFragmentMap,
          currentPath: typeof window !== 'undefined' ? window.location.pathname : undefined
        })
      )

      cleanup(() => teardownSpeculation())
    },
    { strategy: 'document-idle' }
  )

  return null
})

export const FragmentShell = component$(({ plan, initialFragments, path, initialLang }: FragmentShellProps) => {
  const langSignal = useSharedLangSignal()
  useTask$(({ track }) => {
    track(() => initialLang)
    if (langSignal.value !== initialLang) {
      langSignal.value = initialLang
    }
  })
  const copy = useLangCopy(langSignal)
  const planValue = resolvePlan(plan)
  const initialFragmentMap = resolveFragments(initialFragments)
  const fragments = useSignal<FragmentPayloadMap>(initialFragmentMap)
  const status = useSharedFragmentStatusSignal()
  const expandedId = useSignal<string | null>(null)
  const layoutTick = useSignal(0)
  const stackScheduler = useSignal<(() => void) | null>(null)
  const gridRef = useSignal<HTMLDivElement>()
  const fragmentHeaders = useComputed$(() => getFragmentHeaderCopy(langSignal.value))
  const initialReady =
    typeof window !== 'undefined' &&
    (window as typeof window & { __PROM_CLIENT_READY?: boolean }).__PROM_CLIENT_READY === true
  const clientReady = useSignal(initialReady)

  useOnDocument(
    'client-ready',
    $(() => {
      clientReady.value = true
    })
  )

  useOnDocument(
    'keydown',
    $((event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        expandedId.value = null
      }
    })
  )

  useVisibleTask$(({ track }) => {
    track(() => expandedId.value)
    if (typeof document === 'undefined') return
    if (expandedId.value) {
      document.body.classList.add('card-expanded')
    } else {
      document.body.classList.remove('card-expanded')
    }
  })

  useVisibleTask$(
    ({ cleanup }) => {
      if (typeof window === 'undefined') return
      const grid = gridRef.value
      if (!grid || !('ResizeObserver' in window) || planValue.fragments.length < 2) return
      let frame = 0
      let pending = false
      let lastWidth = 0
      let lastHeight = 0
      let ready = false
      let observer: ResizeObserver | null = null

      const resetState = () => {
        pending = false
        ready = false
        lastWidth = 0
        lastHeight = 0
      }

      const teardownObserver = () => {
        observer?.disconnect()
        observer = null
        if (frame) {
          cancelAnimationFrame(frame)
          frame = 0
        }
      }

      const setupObserver = () => {
        if (observer || window.innerWidth < DESKTOP_MIN_WIDTH) return
        resetState()
        const instance = new ResizeObserver((entries) => {
          const entry = entries[0]
          if (!entry) return
          const { width, height } = entry.contentRect
          if (!ready) {
            ready = true
            lastWidth = width
            lastHeight = height
            return
          }
          if (width === lastWidth && height === lastHeight) return
          lastWidth = width
          lastHeight = height
          pending = true
          if (frame) return
          frame = requestAnimationFrame(() => {
            frame = 0
            if (!pending) return
            pending = false
            layoutTick.value += 1
          })
        })
        observer = instance
        instance.observe(grid)
      }

      const handleResize = () => {
        if (window.innerWidth < DESKTOP_MIN_WIDTH) {
          teardownObserver()
          return
        }
        if (!observer) {
          setupObserver()
        }
      }

      setupObserver()
      window.addEventListener('resize', handleResize)

      cleanup(() => {
        window.removeEventListener('resize', handleResize)
        teardownObserver()
      })
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$(
    ({ cleanup }) => {
      cleanup(() => {
        status.value = 'idle'
      })
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$(
    ({ cleanup }) => {
      if (typeof window === 'undefined') return
      const grid = gridRef.value
      if (!grid || typeof ResizeObserver === 'undefined' || planValue.fragments.length < 2) return

      let cardHeights = new WeakMap<HTMLElement, number>()
      let observedCards = new WeakSet<HTMLElement>()
      let frame = 0
      let enabled = false

      const meetsLayoutConditions = () => window.innerWidth >= DESKTOP_MIN_WIDTH && planValue.fragments.length > 1

      const schedule = () => {
        if (frame || !enabled) return
        frame = requestAnimationFrame(() => {
          frame = 0
          const cards = Array.from(grid.querySelectorAll<HTMLElement>('.fragment-card')).filter(
            (element) => !element.classList.contains('is-expanded')
          )
          if (!cards.length) return
          const heights = cards.map((card) => cardHeights.get(card) ?? 0).filter((height) => height > 0)
          if (!heights.length) return

          const maxHeight = Math.max(...heights)
          const baseThreshold = Math.max(520, window.innerHeight * 0.65)
          const isStacked = grid.classList.contains('is-stacked')
          const threshold = isStacked ? baseThreshold * 0.85 : baseThreshold
          const shouldStack = maxHeight >= threshold

          if (shouldStack) {
            grid.classList.add('is-stacked')
          } else {
            grid.classList.remove('is-stacked')
          }
        })
      }

      const cardObserver = new ResizeObserver((entries) => {
        let changed = false
        entries.forEach((entry) => {
          if (!(entry.target instanceof HTMLElement)) return
          const height = entry.contentRect.height
          if (height <= 0) return
          const previous = cardHeights.get(entry.target)
          if (previous === undefined || Math.abs(previous - height) > 0.5) {
            cardHeights.set(entry.target, height)
            changed = true
          }
        })
        if (changed) schedule()
      })

      const collectCards = (root: ParentNode) =>
        root instanceof HTMLElement && root.matches('.fragment-card')
          ? [root, ...Array.from(root.querySelectorAll<HTMLElement>('.fragment-card'))]
          : Array.from(root.querySelectorAll<HTMLElement>('.fragment-card'))

      const observeCards = (root: ParentNode) => {
        collectCards(root).forEach((card) => {
          if (observedCards.has(card)) return
          observedCards.add(card)
          cardObserver.observe(card)
        })
      }

      const unobserveCards = (root: ParentNode) => {
        collectCards(root).forEach((card) => {
          cardObserver.unobserve(card)
          observedCards.delete(card)
        })
      }

      const mutationObserver = new MutationObserver((records) => {
        if (!enabled) return
        records.forEach((record) => {
          record.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement) observeCards(node)
          })
          record.removedNodes.forEach((node) => {
            if (node instanceof HTMLElement) unobserveCards(node)
          })
        })
        schedule()
      })

      const stop = () => {
        if (!enabled) return
        enabled = false
        stackScheduler.value = null
        mutationObserver.disconnect()
        cardObserver.disconnect()
        observedCards = new WeakSet<HTMLElement>()
        cardHeights = new WeakMap<HTMLElement, number>()
        grid.classList.remove('is-stacked')
        if (frame) {
          cancelAnimationFrame(frame)
          frame = 0
        }
      }

      const start = () => {
        if (enabled || !meetsLayoutConditions()) return
        enabled = true
        stackScheduler.value = schedule
        observeCards(grid)
        schedule()
        mutationObserver.observe(grid, { childList: true, subtree: true })
      }

      const handleResize = () => {
        if (!meetsLayoutConditions()) {
          stop()
          return
        }
        if (!enabled) {
          start()
          return
        }
        schedule()
      }

      start()
      window.addEventListener('resize', handleResize)

      cleanup(() => {
        stop()
        window.removeEventListener('resize', handleResize)
      })
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$(
    ({ track }) => {
      track(() => expandedId.value)
      stackScheduler.value?.()
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$(
    ({ track, cleanup }) => {
      track(() => layoutTick.value)
      track(() => expandedId.value)
      if (typeof window === 'undefined') return
      const grid = gridRef.value
      if (!grid || typeof ResizeObserver !== 'undefined' || planValue.fragments.length < 2) return

      let frame = requestAnimationFrame(() => {
        frame = 0
        if (window.innerWidth < DESKTOP_MIN_WIDTH) {
          grid.classList.remove('is-stacked')
          return
        }

        const cards = Array.from(grid.querySelectorAll<HTMLElement>('.fragment-card')).filter(
          (element) => !element.classList.contains('is-expanded')
        )
        if (!cards.length) return
        const heights = cards.map((card) => card.getBoundingClientRect().height).filter((height) => height > 0)
        if (!heights.length) return

        const maxHeight = Math.max(...heights)
        const baseThreshold = Math.max(520, window.innerHeight * 0.65)
        const isStacked = grid.classList.contains('is-stacked')
        const threshold = isStacked ? baseThreshold * 0.85 : baseThreshold
        const shouldStack = maxHeight >= threshold

        if (shouldStack) {
          grid.classList.add('is-stacked')
        } else {
          grid.classList.remove('is-stacked')
        }
      })

      cleanup(() => {
        if (frame) cancelAnimationFrame(frame)
      })
    },
    { strategy: 'document-ready' }
  )

  return (
    <section class="fragment-shell">
      <div ref={gridRef} class="fragment-grid">
        {planValue.fragments.map((entry, index) => {
          const fragment = fragments.value[entry.id]
          const headerCopy = fragmentHeaders.value[entry.id]
          const renderNode =
            fragment && headerCopy ? applyHeaderOverride(fragment.tree, headerCopy) : fragment?.tree
          return (
            <FragmentCard
              key={entry.id}
              id={entry.id}
              fragmentId={entry.id}
              column={entry.layout.column}
              motionDelay={index * 120}
              expandedId={expandedId}
              layoutTick={layoutTick}
              closeLabel={copy.value.fragmentClose}
            >
              {fragment ? (
                <FragmentRenderer node={renderNode ?? fragment.tree} />
              ) : (
                <div class="fragment-placeholder is-loading" role="status" aria-live="polite">
                  <div class="loader" aria-hidden="true" />
                  <span class="sr-only">{copy.value.fragmentLoading.replace('{id}', entry.id)}</span>
                </div>
              )}
            </FragmentCard>
          )
        })}
      </div>
      <FragmentStreamController
        plan={plan}
        initialFragments={initialFragments}
        path={path}
        fragments={fragments}
        status={status}
      />
      {clientReady.value ? (
        <FragmentClientEffects planValue={planValue} initialFragmentMap={initialFragmentMap} />
      ) : null}
    </section>
  )
})
