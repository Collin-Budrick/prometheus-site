import { component$ } from '@builder.io/qwik'
import type { RequestHandler } from '@builder.io/qwik-city'
import { routeLoader$ } from '@builder.io/qwik-city'
import { localeCookieOptions, resolvePreferredLocale } from '../locale-routing'
import BaseLayout from '../[locale]/layout'
import Home from '../[locale]/index'
import { resolveRootLocaleDecision } from '../root-locale'

export { head } from '../[locale]/index'

export const onRequest: RequestHandler = ({ request, cookie, query, locale, redirect, url }) => {
  const { preferred, redirect: redirectTo } = resolveRootLocaleDecision({
    queryLocale: query.get('locale'),
    cookieLocale: cookie.get('locale')?.value ?? null,
    acceptLanguage: request.headers.get('accept-language'),
    search: url.search
  })
  cookie.set('locale', preferred, localeCookieOptions)
  locale(preferred)
  if (redirectTo) throw redirect(302, redirectTo)
}

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
