import { Slot, component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { useLocation } from '@builder.io/qwik-city'
import { setDefaultLocale } from 'compiled-i18n'
import { featureFlags } from '../../config/feature-flags'
import { resolvePathnameLocale } from '../../i18n/pathname-locale'

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => Promise<void> | void) => { finished: Promise<void> }
}

const doubleRaf = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })

const persistLocaleCookie = (locale: string) => {
  if (typeof document === 'undefined') return
  const maxAge = 60 * 60 * 24 * 365
  document.cookie = `locale=${encodeURIComponent(locale)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`
}

export const RouteTransitionBoundary = component$(() => {
  const loc = useLocation()
  const lastHref = useSignal(loc.url.href)
  const lastLocale = useSignal(resolvePathnameLocale(loc.url.pathname))
  const enableViewTransitions = featureFlags.viewTransitions

  useVisibleTask$(({ track }) => {
    const href = track(() => loc.url.href)
    const nextLocale = track(() => resolvePathnameLocale(loc.url.pathname))

    if (nextLocale && nextLocale !== lastLocale.value) {
      document.documentElement.lang = nextLocale
      document.documentElement.setAttribute('q:locale', nextLocale)
      setDefaultLocale(nextLocale)
      persistLocaleCookie(nextLocale)
      lastLocale.value = nextLocale
    }

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
