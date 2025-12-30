import { component$, getLocale, useContextProvider, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { QwikCityProvider, RouterOutlet } from '@builder.io/qwik-city'
import { useQwikSpeak, useSpeakContext } from 'qwik-speak'
import 'virtual:uno.css'
import './global.css'
import { RouterHead } from './routes/layout'
import { defaultLocale, locales, type Locale } from './i18n/locales'
import { normalizeLocale } from './i18n/locale'
import { LocaleContext, registerLocaleSignal, useLocaleSignal, useRenderLocaleSignal } from './i18n/locale-context'
import { registerSpeakContext } from './i18n/speak-context'
import {
  applyLocaleToDom,
  ensureSpeakLocale,
  persistLocaleCookie,
  persistLocaleStorage,
  readStoredLocale
} from './i18n/locale-sync'
import { config } from './speak-config'
import { translationFn } from './speak-functions'

const toBoolean = (value: string | boolean | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback
  if (typeof value === 'boolean') return value
  return value === '1' || value.toLowerCase() === 'true'
}

const featureFlags = {
  viewTransitions: toBoolean(import.meta.env.VITE_ROUTE_VIEW_TRANSITIONS, true)
}

declare const __EXPERIMENTAL__: Record<string, unknown> | undefined

// Ensure Qwik City experimental flag exists on both client and server to avoid runtime failures.
const experimentalGlobal =
  (typeof __EXPERIMENTAL__ !== 'undefined' && __EXPERIMENTAL__) || (globalThis as typeof globalThis & { __EXPERIMENTAL__?: Record<string, unknown> }).__EXPERIMENTAL__ || {}
;(globalThis as typeof globalThis & { __EXPERIMENTAL__: Record<string, unknown> }).__EXPERIMENTAL__ = experimentalGlobal


const RoutesWithLocaleSync = component$(() => {
  const localeSignal = useLocaleSignal()
  const speak = useSpeakContext()
  const renderLocale = useRenderLocaleSignal()

  useVisibleTask$(() => {
    registerLocaleSignal(renderLocale)
    registerSpeakContext(speak)
    const stored = readStoredLocale()
    if (stored && stored !== localeSignal.value) {
      localeSignal.value = stored
    }
  })

  useVisibleTask$(async ({ track }) => {
    const nextLocale = track(() => localeSignal.value)
    if (!locales.includes(nextLocale)) return

    await ensureSpeakLocale(nextLocale, speak)
    applyLocaleToDom(nextLocale)
    persistLocaleCookie(nextLocale)
    persistLocaleStorage(nextLocale)
    renderLocale.value = nextLocale
  })

  return (
    <div key={renderLocale.value} data-locale={renderLocale.value}>
      <RouterOutlet />
    </div>
  )
})

export default component$(() => {
  const initialLocale = normalizeLocale(getLocale(defaultLocale)) ?? defaultLocale
  const localeSignal = useSignal<Locale>(initialLocale)
  const renderLocaleSignal = useSignal<Locale>(initialLocale)
  useContextProvider(LocaleContext, { locale: localeSignal, renderLocale: renderLocaleSignal })

  useQwikSpeak({ config, translationFn })

  useVisibleTask$(() => {
    if (!toBoolean(import.meta.env.VITE_PREVIEW, false)) return
    if (typeof window === 'undefined') return

    const setStatus = (status: string) => {
      document.documentElement.dataset.bfcache = status
    }

    const handlePageShow = (event: PageTransitionEvent) => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      const restored = event.persisted || navigation?.type === 'back_forward'
      setStatus(restored ? 'restored' : 'miss')
      console.info(`[preview] BFCache ${restored ? 'restored' : 'miss'}`)
    }

    const handlePageHide = (event: PageTransitionEvent) => {
      if (event.persisted) setStatus('stored')
    }

    window.addEventListener('pageshow', handlePageShow)
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      window.removeEventListener('pageshow', handlePageShow)
      window.removeEventListener('pagehide', handlePageHide)
    }
  })

  const localeKey = localeSignal.value
  return (
    <QwikCityProvider viewTransition={featureFlags.viewTransitions}>
      <head>
        <meta charSet="utf-8" />
        <RouterHead key={localeKey} />
      </head>
      <body class="app-shell">
        <RoutesWithLocaleSync />
      </body>
    </QwikCityProvider>
  )
})
