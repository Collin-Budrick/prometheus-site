import { component$, useSignal } from '@builder.io/qwik'
import type { FragmentPayloadMap, FragmentPayloadValue, FragmentPlan, FragmentPlanValue } from '../../fragment/types'
import { FragmentRenderer } from './FragmentRenderer'
import { FragmentStreamController } from './FragmentStreamController'

type FragmentShellProps = {
  plan: FragmentPlanValue
  initialFragments: FragmentPayloadValue
  path: string
}

const resolvePlan = (plan: FragmentPlanValue): FragmentPlan => plan as FragmentPlan

export const FragmentShell = component$(({ plan, initialFragments, path }: FragmentShellProps) => {
  const planValue = resolvePlan(plan)
  const fragments = useSignal<FragmentPayloadMap>((initialFragments as FragmentPayloadMap) ?? {})
  const status = useSignal<'idle' | 'streaming' | 'error'>('idle')

  return (
    <section class="fragment-shell">
      <div class="fragment-status">
        <span class="dot" />
        <span>{status.value === 'streaming' ? 'Streaming fragments' : status.value === 'error' ? 'Stream stalled' : 'Idle'}</span>
      </div>
      <div class="fragment-grid">
        {planValue.fragments.map((entry) => {
          const fragment = fragments.value[entry.id]
          return (
            <article key={entry.id} class="fragment-card" style={{ gridColumn: entry.layout.column }} data-motion>
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
