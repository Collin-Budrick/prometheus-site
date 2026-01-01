import { component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import type { FragmentPayload, FragmentPlan } from '../fragment/types'
import { applyFragmentEffects, streamFragments } from '../fragment/client'
import { FragmentRenderer } from './FragmentRenderer'

type FragmentShellProps = {
  plan: FragmentPlan
  initialFragments: Record<string, FragmentPayload>
  path: string
}

export const FragmentShell = component$(({ plan, initialFragments, path }: FragmentShellProps) => {
  const fragments = useSignal<Record<string, FragmentPayload>>(initialFragments)
  const status = useSignal<'idle' | 'streaming' | 'error'>('idle')

  useVisibleTask$(({ cleanup }) => {
    let active = true
    status.value = 'streaming'

    Object.values(fragments.value).forEach((payload) => applyFragmentEffects(payload))

    const handleFragment = (payload: FragmentPayload) => {
      if (!active) return
      applyFragmentEffects(payload)
      const update = () => {
        fragments.value = { ...fragments.value, [payload.id]: payload }
      }
      const startTransition = document.startViewTransition
      if (typeof startTransition === 'function') {
        startTransition.call(document, update)
      } else {
        update()
      }
    }

    streamFragments(path, handleFragment).catch((error) => {
      if (!active) return
      console.error('Fragment stream failed', error)
      status.value = 'error'
    })

    cleanup(() => {
      active = false
    })
  })

  return (
    <section class="fragment-shell">
      <div class="fragment-status">
        <span class="dot" />
        <span>{status.value === 'streaming' ? 'Streaming fragments' : status.value === 'error' ? 'Stream stalled' : 'Idle'}</span>
      </div>
      <div class="fragment-grid">
        {plan.fragments.map((entry) => {
          const fragment = fragments.value[entry.id]
          return (
            <article key={entry.id} class="fragment-card" style={{ gridColumn: entry.layout.column }}>
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
    </section>
  )
})
