import { $, component$, useOnDocument, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import type { FragmentPayloadMap, FragmentPayloadValue, FragmentPlan, FragmentPlanValue } from '../../fragment/types'
import { FragmentCard } from '../../components/FragmentCard'
import { applySpeculationRules, buildSpeculationRulesForPlan } from '../../shared/speculation'
import { isPrefetchEnabled } from '../../shared/prefetch'
import { FragmentRenderer } from './FragmentRenderer'
import { FragmentStreamController } from './FragmentStreamController'
import { resolveFragments, resolvePlan } from './utils'

type FragmentShellProps = {
  plan: FragmentPlanValue
  initialFragments: FragmentPayloadValue
  path: string
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

export const FragmentShell = component$(({ plan, initialFragments, path }: FragmentShellProps) => {
  const planValue = resolvePlan(plan)
  const initialFragmentMap = resolveFragments(initialFragments)
  const fragments = useSignal<FragmentPayloadMap>(initialFragmentMap)
  const status = useSignal<'idle' | 'streaming' | 'error'>('idle')
  const expandedId = useSignal<string | null>(null)
  const layoutTick = useSignal(0)
  const gridRef = useSignal<HTMLDivElement>()
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

  return (
    <section class="fragment-shell">
      <div class="fragment-status">
        <span class="dot" />
        <span>{status.value === 'streaming' ? 'Streaming fragments' : status.value === 'error' ? 'Stream stalled' : 'Idle'}</span>
      </div>
      <div ref={gridRef} class="fragment-grid">
        {planValue.fragments.map((entry, index) => {
          const fragment = fragments.value[entry.id]
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
                <FragmentRenderer node={fragment.tree} />
              ) : (
                <div class="fragment-placeholder">
                  <div class="meta-line">fragment miss</div>
                  <p>{entry.id}</p>
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
