import { component$ } from '@builder.io/qwik'
import type { RequestHandler } from '@builder.io/qwik-city'
import { localeCookieOptions, resolvePreferredLocale } from '../locale-routing'

export const onGet: RequestHandler = ({ request, redirect, url, cookie, query }) => {
  const preferred = resolvePreferredLocale({
    queryLocale: query.get('locale'),
    cookieLocale: cookie.get('locale')?.value ?? null,
    acceptLanguage: request.headers.get('accept-language')
  })

  cookie.set('locale', preferred, localeCookieOptions)
  const params = new URLSearchParams(url.search)
  params.delete('locale')
  const search = params.toString()
  throw redirect(302, `/${preferred}/chat${search ? `?${search}` : ''}`)
}

export default component$(() => null)

