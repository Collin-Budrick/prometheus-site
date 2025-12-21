import { component$ } from '@builder.io/qwik'
import { routeLoader$ } from '@builder.io/qwik-city'
import { localeCookieOptions, resolvePreferredLocale } from '../locale-routing'
import BaseLayout from '../[locale]/layout'
import ChatPage from '../[locale]/chat/index'

export { head } from '../[locale]/chat/index'

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
      <ChatPage />
    </BaseLayout>
  )
})
