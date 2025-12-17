import { Slot, component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { useLocation } from '@builder.io/qwik-city'
import { featureFlags } from '../../config/feature-flags'

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => Promise<void> | void) => { finished: Promise<void> }
}

const doubleRaf = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })

export const RouteTransitionBoundary = component$(() => {
  const loc = useLocation()
  const lastHref = useSignal(loc.url.href)
  const enableViewTransitions = featureFlags.viewTransitions

  useVisibleTask$(({ track }) => {
    const href = track(() => loc.url.href)

    if (!enableViewTransitions) {
      lastHref.value = href
      return
    }

    if (typeof document === 'undefined') return
    if (href === lastHref.value) return

    const viewDoc = document as ViewTransitionDocument
    const startViewTransition = viewDoc.startViewTransition

    if (!startViewTransition) {
      lastHref.value = href
      return
    }

    const transition = startViewTransition.call(viewDoc, () => doubleRaf())
    transition?.finished.catch(() => {})

    lastHref.value = href
  })

  return <Slot />
})
