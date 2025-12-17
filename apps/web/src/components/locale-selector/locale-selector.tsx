import { component$ } from '@builder.io/qwik'
import { useLocation } from '@builder.io/qwik-city'
import { localeNames, locales } from 'compiled-i18n'
import { resolveLocale } from '../../i18n/locale'

export const LocaleSelector = component$(() => {
  const loc = useLocation()
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
        return (
          <a
            key={locale}
            href={buildHref(locale)}
            aria-disabled={isCurrent}
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
