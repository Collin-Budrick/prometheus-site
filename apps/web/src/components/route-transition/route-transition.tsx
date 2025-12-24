import { Slot, component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { useLocation } from '@builder.io/qwik-city'
import { setDefaultLocale } from 'compiled-i18n'
import { resolvePathnameLocale } from '../../i18n/pathname-locale'

const persistLocaleCookie = (locale: string) => {
  if (typeof document === 'undefined') return
  const maxAge = 60 * 60 * 24 * 365
  document.cookie = `locale=${encodeURIComponent(locale)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`
}

export const RouteTransitionBoundary = component$(() => {
  const loc = useLocation()
  const lastLocale = useSignal(resolvePathnameLocale(loc.url.pathname))

  useVisibleTask$(({ track }) => {
    const nextLocale = track(() => resolvePathnameLocale(loc.url.pathname))

    if (nextLocale && nextLocale !== lastLocale.value) {
      document.documentElement.lang = nextLocale
      document.documentElement.setAttribute('q:locale', nextLocale)
      setDefaultLocale(nextLocale)
      persistLocaleCookie(nextLocale)
      lastLocale.value = nextLocale
    }
  })

  return <Slot />
})
