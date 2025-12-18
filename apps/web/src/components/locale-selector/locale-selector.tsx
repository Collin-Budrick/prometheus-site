import { component$ } from '@builder.io/qwik'
import { useLocation, useNavigate } from '@builder.io/qwik-city'
import { localeNames, locales } from 'compiled-i18n'
import { resolveLocale } from '../../i18n/locale'
import { featureFlags } from '../../config/feature-flags'

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => Promise<void> | void) => { finished: Promise<void> }
}

export const LocaleSelector = component$(() => {
  const loc = useLocation()
  const navigate = useNavigate()
  const queryLocale = loc.url.searchParams.get('locale')
  const cookieLocale =
    typeof document !== 'undefined'
      ? document.cookie
          .split(';')
          .map((entry) => entry.trim())
          .find((entry) => entry.startsWith('locale='))
          ?.split('=')[1]
      : undefined
  const acceptLanguage = typeof navigator !== 'undefined' ? navigator.languages?.join(',') || navigator.language : undefined
  const currentLocale = resolveLocale({ queryLocale, cookieLocale, acceptLanguage })

  const buildHref = (locale: string) => {
    const params = new URLSearchParams(loc.url.search)
    params.set('locale', locale)
    const search = params.toString()
    return `${loc.url.pathname}${search ? `?${search}` : ''}`
  }

  return (
    <div class="flex items-center gap-1 text-xs">
      {locales.map((locale) => {
        const isCurrent = locale === currentLocale
        const href = buildHref(locale)
        return (
          <a
            key={locale}
            href={href}
            aria-disabled={isCurrent}
            style={isCurrent ? { viewTransitionName: 'locale-pill' } : undefined}
            onClick$={async (event) => {
              if (isCurrent) return
              if (event.defaultPrevented) return
              if (event.button !== 0) return
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

              event.preventDefault()

              if (typeof document === 'undefined') {
                await navigate(href)
                return
              }

              const viewDoc = document as ViewTransitionDocument
              const startViewTransition = !featureFlags.viewTransitions ? viewDoc.startViewTransition : undefined
              if (startViewTransition) {
                const transition = startViewTransition.call(viewDoc, () => navigate(href))
                transition?.finished.catch(() => {})
                return
              }

              await navigate(href)
            }}
            class={[
              'rounded-full border px-2 py-1 transition-colors',
              isCurrent
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200 pointer-events-none'
                : 'border-slate-700 text-slate-300 hover:text-emerald-200 hover:border-emerald-500/40'
            ].join(' ')}
          >
            {localeNames[locale] ?? locale.toUpperCase()}
          </a>
        )
      })}
    </div>
  )
})
