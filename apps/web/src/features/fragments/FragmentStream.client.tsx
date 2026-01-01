import { component$, useVisibleTask$ } from '@builder.io/qwik'
import type { Signal } from '@builder.io/qwik'
import { applyFragmentEffects, fetchFragment, streamFragments, teardownFragmentEffects } from '../../fragment/client'
import type {
  FragmentPayload,
  FragmentPayloadMap,
  FragmentPayloadMapValue,
  FragmentPlan,
  FragmentPlanValue
} from '../../fragment/types'

type FragmentStreamClientProps = {
  plan: FragmentPlanValue
  initialFragments: FragmentPayloadMapValue
  fragments: Signal<FragmentPayloadMap>
  status: Signal<'idle' | 'streaming' | 'error'>
  path: string
}

const resolvePlan = (plan: FragmentPlanValue): FragmentPlan | null =>
  plan && typeof plan === 'object' && 'fragments' in plan ? (plan as FragmentPlan) : null

const resolveFragments = (fragments: FragmentPayloadMapValue): FragmentPayloadMap =>
  (fragments as FragmentPayloadMap) || {}

export const FragmentStreamClient = component$(
  ({ plan: planValue, initialFragments, fragments, status, path }: FragmentStreamClientProps) => {
    useVisibleTask$(({ cleanup }) => {
      const plan = resolvePlan(planValue)
      if (!plan) {
        status.value = 'error'
        return
      }

      let active = true
      const controller = new AbortController()
      const initialPayloads = resolveFragments(initialFragments)
      status.value = 'streaming'

      Object.values(initialPayloads).forEach((payload) => applyFragmentEffects(payload))

      const hydrateMissingFragments = async () => {
        const missing = plan.fragments.map((entry) => entry.id).filter((id) => !fragments.value[id])
        if (!missing.length) return

        const results = await Promise.allSettled(missing.map((id) => fetchFragment(id)))
        if (!active) return

        const current = fragments.value
        let next: FragmentPayloadMap | null = null

        results.forEach((result, index) => {
          if (result.status !== 'fulfilled') return
          const payload = result.value
          applyFragmentEffects(payload)
          if (current[missing[index]] !== payload) {
            next ??= structuredClone(current)
            next[missing[index]] = payload
          }
        })

        if (next) {
          fragments.value = next
        }
      }

      const missingAtMount = plan.fragments.map((entry) => entry.id).filter((id) => !initialPayloads[id])
      const fallbackTimer = missingAtMount.length
        ? window.setTimeout(() => {
            if (!active) return
            void hydrateMissingFragments()
          }, 2000)
        : null

      const handleFragment = (payload: FragmentPayload) => {
        if (!active) return
        applyFragmentEffects(payload)
        const update = () => {
          const current = fragments.value
          if (current[payload.id] === payload) return
          const next = structuredClone(current)
          next[payload.id] = payload
          fragments.value = next
        }
        const startTransition = document.startViewTransition
        if (typeof startTransition === 'function') {
          startTransition.call(document, update)
        } else {
          update()
        }
      }

      streamFragments(path, handleFragment, undefined, controller.signal)
        .then(() => {
          if (!active) return
          if (fallbackTimer) window.clearTimeout(fallbackTimer)
          status.value = 'idle'
          void hydrateMissingFragments()
        })
        .catch((error) => {
          if (!active) return
          if (fallbackTimer) window.clearTimeout(fallbackTimer)
          if ((error as Error)?.name === 'AbortError' || controller.signal.aborted) {
            status.value = 'idle'
            return
          }
          console.error('Fragment stream failed', error)
          status.value = 'error'
          void hydrateMissingFragments()
        })

      cleanup(() => {
        active = false
        controller.abort()
        if (fallbackTimer) window.clearTimeout(fallbackTimer)
        teardownFragmentEffects(Object.keys(fragments.value))
      })
    })

    return null
  }
)
