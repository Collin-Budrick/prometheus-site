import { component$, getLocale, useContextProvider, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { QwikCityProvider, RouterOutlet } from '@builder.io/qwik-city'
import { useQwikSpeak, useSpeakContext } from 'qwik-speak'
import 'virtual:uno.css'
import './global.css'
import { RouterHead } from './routes/layout'
import { defaultLocale, localeToSpeakLocale, locales, type Locale } from './i18n/locales'
import { normalizeLocale } from './i18n/locale'
import { LocaleContext, registerLocaleSignal, useLocaleSignal } from './i18n/locale-context'
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

const persistLocaleCookie = (locale: string) => {
  if (typeof document === 'undefined') return
  const maxAge = 60 * 60 * 24 * 365
  document.cookie = `locale=${encodeURIComponent(locale)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`
}

const readStoredLocale = (): Locale | null => {
  if (typeof document === 'undefined') return null
  try {
    const stored = window.localStorage.getItem('locale')
    return normalizeLocale(stored) ?? null
  } catch {
    return null
  }
}

const persistLocaleStorage = (locale: string) => {
  if (typeof document === 'undefined') return
  try {
    window.localStorage.setItem('locale', locale)
  } catch {}
}

const applyLocaleToDom = (locale: Locale) => {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale
  document.documentElement.setAttribute('q:locale', locale)
}

const ensureSpeakLocale = async (
  locale: Locale,
  ctx: ReturnType<typeof useSpeakContext>
) => {
  const mapping = localeToSpeakLocale[locale]
  if (mapping) {
    Object.assign(ctx.locale, mapping)
  } else {
    ctx.locale.lang = locale
  }

  const assets = ctx.config.assets ?? []
  if (!assets.length) return

  if (!ctx.translation[locale]) {
    ctx.translation[locale] = {}
  }

  const existing = ctx.translation[locale]
  if (existing && Object.keys(existing).length > 0) return

  const results = await Promise.all(
    assets.map((asset) => ctx.translationFn.loadTranslation$(locale, asset))
  )
  results.forEach((payload) => {
    if (payload) Object.assign(existing, payload)
  })
}

const RoutesWithLocaleSync = component$(() => {
  const localeSignal = useLocaleSignal()
  const speak = useSpeakContext()
  const renderLocale = useSignal<Locale>(localeSignal.value)

  useVisibleTask$(() => {
    registerLocaleSignal(localeSignal)
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

  return <RouterOutlet key={renderLocale.value} />
})

export default component$(() => {
  const initialLocale = normalizeLocale(getLocale(defaultLocale)) ?? defaultLocale
  const localeSignal = useSignal<Locale>(initialLocale)
  useContextProvider(LocaleContext, { locale: localeSignal })

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
