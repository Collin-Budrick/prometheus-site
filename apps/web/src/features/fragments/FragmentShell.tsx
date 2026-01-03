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

  return (
    <section class="fragment-shell">
      <div class="fragment-status">
        <span class="dot" />
        <span>{status.value === 'streaming' ? 'Streaming fragments' : status.value === 'error' ? 'Stream stalled' : 'Idle'}</span>
      </div>
      <div class="fragment-grid">
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
