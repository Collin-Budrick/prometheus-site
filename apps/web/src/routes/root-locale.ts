import { defaultLocale } from 'compiled-i18n'
import { resolvePreferredLocale } from './locale-routing'

type RootLocaleInput = {
  queryLocale?: string | null
  cookieLocale?: string | null
  acceptLanguage?: string | null
  search?: string | null
}

type RootLocaleDecision = {
  preferred: string
  redirect?: string
}

export const resolveRootLocaleDecision = (opts: RootLocaleInput): RootLocaleDecision => {
  const preferred = resolvePreferredLocale({
    queryLocale: opts.queryLocale,
    cookieLocale: opts.cookieLocale,
    acceptLanguage: opts.acceptLanguage
  })

  if (preferred === defaultLocale) return { preferred }

  const params = new URLSearchParams(opts.search ?? '')
  params.delete('locale')
  const search = params.toString()

  return {
    preferred,
    redirect: `/${preferred}${search ? `?${search}` : ''}`
  }
}
