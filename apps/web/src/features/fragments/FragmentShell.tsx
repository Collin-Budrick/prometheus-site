import { $, component$, useComputed$, useOnDocument, useSignal, useTask$, useVisibleTask$ } from '@builder.io/qwik'
import type { FragmentPayloadMap, FragmentPayloadValue, FragmentPlan, FragmentPlanValue } from '../../fragment/types'
import { FragmentCard } from '../../components/FragmentCard'
import { applySpeculationRules, buildSpeculationRulesForPlan } from '../../shared/speculation'
import { isPrefetchEnabled } from '../../shared/prefetch'
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

const FragmentClientEffects = component$(({ planValue, initialFragmentMap }: FragmentClientEffectsProps) => {
  useVisibleTask$(
    ({ cleanup }) => {
      if (!isPrefetchEnabled(import.meta.env)) return

      const teardownSpeculation = applySpeculationRules(
        buildSpeculationRulesForPlan(planValue, import.meta.env, {
          knownFragments: initialFragmentMap
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
  const status = useSignal<'idle' | 'streaming' | 'error'>('idle')
  const expandedId = useSignal<string | null>(null)
  const layoutTick = useSignal(0)
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
      if (!grid || !('ResizeObserver' in window)) return
      let frame = 0
      let pending = false
      let lastWidth = 0
      let lastHeight = 0
      let ready = false

      const observer = new ResizeObserver((entries) => {
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

      observer.observe(grid)

      cleanup(() => {
        observer.disconnect()
        if (frame) cancelAnimationFrame(frame)
      })
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$(
    ({ track, cleanup }) => {
      track(() => layoutTick.value)
      track(() => expandedId.value)
      if (typeof window === 'undefined') return
      const grid = gridRef.value
      if (!grid) return

      let frame = requestAnimationFrame(() => {
        frame = 0
        if (window.innerWidth < 1025) {
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
      <div class="fragment-status">
        <span class="dot" />
        <span>
          {status.value === 'streaming'
            ? copy.value.fragmentStatusStreaming
            : status.value === 'error'
              ? copy.value.fragmentStatusStalled
              : copy.value.fragmentStatusIdle}
        </span>
      </div>
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
