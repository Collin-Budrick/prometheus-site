import { component$ } from '@builder.io/qwik'
import type { RequestHandler } from '@builder.io/qwik-city'
import { localeCookieOptions, resolvePreferredLocale } from './locale-routing'

export const onGet: RequestHandler = ({ request, redirect, url, cookie, query }) => {
  const preferred = resolvePreferredLocale({
    queryLocale: query.get('locale'),
    cookieLocale: cookie.get('locale')?.value ?? null,
    acceptLanguage: request.headers.get('accept-language')
  })

  cookie.set('locale', preferred, localeCookieOptions)
  throw redirect(302, `/${preferred}${url.search}`)
}

export default component$(() => null)
