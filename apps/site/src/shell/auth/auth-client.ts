import type { Lang } from '../../lang/types'
export { clearClientAuthSessionCache, loadClientAuthSession } from '../../features/auth/auth-session-client'

export const redirectProtectedStaticRouteToLogin = (lang: Lang) => {
  const loginUrl = new URL('/login', window.location.origin)
  loginUrl.searchParams.set('lang', lang)
  const currentUrl = new URL(window.location.href)
  const next = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`
  loginUrl.searchParams.set('next', next)
  window.location.assign(`${loginUrl.pathname}${loginUrl.search}${loginUrl.hash}`)
}
