import { component$, getLocale } from '@builder.io/qwik'
import { Link, useLocation } from '@builder.io/qwik-city'
import { localeNames, locales } from 'compiled-i18n'

export const LocaleSelector = component$(() => {
  const loc = useLocation()
  const currentLocale = getLocale()

  const buildHref = (nextLocale: string) => {
    const segments = loc.url.pathname.split('/').filter(Boolean)
    const hasLocale = segments.length > 0 && locales.includes(segments[0] as any)
    const rest = hasLocale ? segments.slice(1) : segments
    const pathname = `/${nextLocale}${rest.length ? `/${rest.join('/')}` : ''}`

    const params = new URLSearchParams(loc.url.search)
    params.delete('locale')
    const search = params.toString()
    return `${pathname}${search ? `?${search}` : ''}`
  }

  return (
    <div class="flex items-center gap-1 text-xs">
      {locales.map((locale) => {
        const isCurrent = locale === (currentLocale as any)
        const href = buildHref(locale)
        return (
          <Link
            key={locale}
            href={href}
            reload
            aria-disabled={isCurrent}
            style={isCurrent ? { viewTransitionName: 'locale-pill' } : undefined}
            class={[
              'rounded-full border px-2 py-1 transition-colors',
              isCurrent
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200 pointer-events-none'
                : 'border-slate-700 text-slate-300 hover:text-emerald-200 hover:border-emerald-500/40'
            ].join(' ')}
          >
            {localeNames[locale] ?? locale.toUpperCase()}
          </Link>
        )
      })}
    </div>
  )
})
