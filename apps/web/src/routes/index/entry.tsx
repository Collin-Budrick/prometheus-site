import { component$ } from '@builder.io/qwik'
import { routeLoader$ } from '@builder.io/qwik-city'
import { localeCookieOptions, resolvePreferredLocale } from '../_shared/locale/locale-routing'
import BaseLayout from '../[locale]/layout'
import Home from '../[locale]/index'
import { onRequest as rootOnRequest } from '../_shared/locale/on-request'

export { head } from '../[locale]/index'
export const onRequest = rootOnRequest

export const usePreferredLocale = routeLoader$(({ request, cookie, query, locale }) => {
  const preferred = resolvePreferredLocale({
    queryLocale: query.get('locale'),
    cookieLocale: cookie.get('locale')?.value ?? null,
    acceptLanguage: request.headers.get('accept-language')
  })

  cookie.set('locale', preferred, localeCookieOptions)
  locale(preferred)

  return preferred
})

export default component$(() => {
  usePreferredLocale()

  return (
    <BaseLayout>
      <Home />
    </BaseLayout>
  )
})
