import { component$, useSignal } from '@builder.io/qwik'
import { FragmentRenderer } from '../../components/FragmentRenderer'
import type { FragmentPayloadMap, FragmentPayloadMapValue, FragmentPlan, FragmentPlanValue } from '../../fragment/types'
import { FragmentStreamClient } from './FragmentStream.client'

type FragmentShellProps = {
  plan: FragmentPlanValue
  initialFragments: FragmentPayloadMapValue
  path: string
}

const resolvePlan = (plan: FragmentPlanValue, path: string): FragmentPlan =>
  (plan as FragmentPlan) || { createdAt: Date.now(), fragments: [], path }
const resolveFragments = (fragments: FragmentPayloadMapValue): FragmentPayloadMap =>
  (fragments as FragmentPayloadMap) || {}

export const FragmentShell = component$(({ plan, initialFragments, path }: FragmentShellProps) => {
  const fragmentPlan = resolvePlan(plan, path)
  const fragments = useSignal<FragmentPayloadMap>(resolveFragments(initialFragments))
  const status = useSignal<'idle' | 'streaming' | 'error'>('idle')

  return (
    <section class="fragment-shell">
      <div class="fragment-status">
        <span class="dot" />
        <span>{status.value === 'streaming' ? 'Streaming fragments' : status.value === 'error' ? 'Stream stalled' : 'Idle'}</span>
      </div>
      <div class="fragment-grid">
        {fragmentPlan.fragments.map((entry) => {
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
      <FragmentStreamClient
        fragments={fragments}
        initialFragments={fragments.value}
        path={path}
        plan={fragmentPlan}
        status={status}
      />
    </section>
  )
})
