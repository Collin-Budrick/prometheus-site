import { component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import type { FragmentPayloadMap, FragmentPayloadValue, FragmentPlanValue } from '../../fragment/types'
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

const buildMotionStyle = (column: string, index: number) =>
  ({ gridColumn: column, '--motion-delay': `${index * 120}ms` } as Record<string, string>)

export const FragmentShell = component$(({ plan, initialFragments, path }: FragmentShellProps) => {
  const planValue = resolvePlan(plan)
  const initialFragmentMap = resolveFragments(initialFragments)
  const fragments = useSignal<FragmentPayloadMap>(initialFragmentMap)
  const status = useSignal<'idle' | 'streaming' | 'error'>('idle')

  useVisibleTask$(({ cleanup, track }) => {
    track(() => path)

    if (!isPrefetchEnabled(import.meta.env)) return

    const teardownSpeculation = applySpeculationRules(
      buildSpeculationRulesForPlan(planValue, import.meta.env, {
        knownFragments: initialFragmentMap
      })
    )

    cleanup(() => teardownSpeculation())
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
            <article
              key={entry.id}
              class="fragment-card"
              style={buildMotionStyle(entry.layout.column, index)}
              data-motion
            >
              {fragment ? (
                <FragmentRenderer node={fragment.tree} />
              ) : (
                <div class="fragment-placeholder">
                  <div class="meta-line">fragment miss</div>
                  <p>{entry.id}</p>
                </div>
              )}
            </article>
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
    </section>
  )
})
