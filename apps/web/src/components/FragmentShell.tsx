import { component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import type { FragmentPayload, FragmentPlan } from '../fragment/types'
import { applyFragmentEffects, fetchFragment, streamFragments } from '../fragment/client'
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

    const hydrateMissingFragments = async () => {
      const missing = plan.fragments.map((entry) => entry.id).filter((id) => !fragments.value[id])
      if (!missing.length) return

      const results = await Promise.allSettled(missing.map((id) => fetchFragment(id)))
      if (!active) return

      const updates: Record<string, FragmentPayload> = {}
      results.forEach((result, index) => {
        if (result.status !== 'fulfilled') return
        const payload = result.value
        applyFragmentEffects(payload)
        updates[missing[index]] = payload
      })

      if (Object.keys(updates).length) {
        fragments.value = { ...fragments.value, ...updates }
      }
    }

    const hasMissing = plan.fragments.some((entry) => !fragments.value[entry.id])
    const fallbackTimer = hasMissing
      ? window.setTimeout(() => {
          if (!active) return
          void hydrateMissingFragments()
        }, 2000)
      : null

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

    streamFragments(path, handleFragment)
      .then(() => {
        if (!active) return
        if (fallbackTimer) window.clearTimeout(fallbackTimer)
        status.value = 'idle'
        void hydrateMissingFragments()
      })
      .catch((error) => {
        if (!active) return
        if (fallbackTimer) window.clearTimeout(fallbackTimer)
        console.error('Fragment stream failed', error)
        status.value = 'error'
        void hydrateMissingFragments()
      })

    cleanup(() => {
      active = false
      if (fallbackTimer) window.clearTimeout(fallbackTimer)
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
