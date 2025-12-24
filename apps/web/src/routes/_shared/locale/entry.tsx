import { component$, type Component } from '@builder.io/qwik'
import { routeLoader$ } from '@builder.io/qwik-city'
import { localeCookieOptions, resolvePreferredLocale } from './locale-routing'
import BaseLayout from '../../[locale]/layout'

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

export const LocaleEntry = <Props extends Record<string, any>>(Page: Component<Props>) =>
  component$<Props>((props) => {
    usePreferredLocale()
    const PageComponent = Page as Component<Record<string, any>>

    return (
      <BaseLayout>
        <PageComponent {...(props as Record<string, any>)} />
      </BaseLayout>
    )
  })
