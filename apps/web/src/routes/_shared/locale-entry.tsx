import { component$, type Component } from '@builder.io/qwik'
import { routeLoader$ } from '@builder.io/qwik-city'
import { localeCookieOptions, resolvePreferredLocale } from '../locale-routing'
import BaseLayout from '../[locale]/layout'

export const resolvePreferredLocaleLoader: Parameters<typeof routeLoader$>[0] = ({
  request,
  cookie,
  query,
  locale
}) => {
  const preferred = resolvePreferredLocale({
    queryLocale: query.get('locale'),
    cookieLocale: cookie.get('locale')?.value ?? null,
    acceptLanguage: request.headers.get('accept-language')
  })

  cookie.set('locale', preferred, localeCookieOptions)
  locale(preferred)

  return preferred
}

export const usePreferredLocale = routeLoader$(resolvePreferredLocaleLoader)

type LocaleEntryOptions = {
  head?: unknown
  data?: unknown
}

export const LocaleEntry = <Props,>(
  Page: Component<Props>,
  _options?: LocaleEntryOptions
) =>
  component$(() => {
    usePreferredLocale()

    return (
      <BaseLayout>
        <Page />
      </BaseLayout>
    )
  })
