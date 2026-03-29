import type { RequestEvent, RequestHandler } from '@builder.io/qwik-city'
import type { TemplateFeatureId } from '@prometheus/template-config'
import { isSiteFeatureEnabled } from '../site-config'
import { loadAuthSession } from '../features/auth/auth-session'
import { isStaticShellBuild } from '../shell/core/build-mode'
import { buildSiteCsp, getOrCreateRequestCspNonce } from '../security/server'

export const PUBLIC_SWR_CACHE = 'public, max-age=0, s-maxage=30, stale-while-revalidate=120'
// Keep authenticated pages out of shared caches without disabling browser revalidation and bfcache.
export const PRIVATE_REVALIDATE_CACHE = 'private, no-cache, max-age=0, must-revalidate'
const AUTH_NEXT_PATH_SESSION_KEY = 'prom-auth-next'
const AUTH_NEXT_PATH_WINDOW_NAME_PREFIX = 'prom-auth-next:'

const notFoundResponse = () =>
  new Response('Not found', {
    status: 404,
    headers: {
      'Cache-Control': 'no-store'
    }
  })

export const ensureFeatureEnabled = (featureId: TemplateFeatureId) => {
  if (!isSiteFeatureEnabled(featureId)) {
    throw notFoundResponse()
  }
}

export const createFeatureRouteHandler = (
  featureId: TemplateFeatureId,
  next?: (event: RequestEvent) => Response | Promise<Response | void> | void
): RequestHandler => {
  return async (event) => {
    if (!isSiteFeatureEnabled(featureId)) {
      event.send(notFoundResponse())
      return
    }
    const response = await next?.(event)
    if (response instanceof Response) {
      event.send(response)
    }
  }
}

export const createCacheHandler = (cacheControl: string): RequestHandler => ({ headers }) => {
  headers.set('Cache-Control', cacheControl)
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export const createClientLoginRedirectResponse = ({
  loginHref,
  nextPath,
  cacheControl,
  nonce,
  currentOrigin,
  pathname
}: {
  loginHref: string
  nextPath: string
  cacheControl: string
  nonce: string
  currentOrigin: string
  pathname: string
}) =>
  new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="0;url=${escapeHtml(loginHref)}">
    <title>Redirecting to login</title>
  </head>
  <body>
    <script nonce="${escapeHtml(nonce)}">
      try {
        window.sessionStorage.setItem(${JSON.stringify(AUTH_NEXT_PATH_SESSION_KEY)}, ${JSON.stringify(nextPath)});
      } catch (error) {}
      try {
        window.name = ${JSON.stringify(`${AUTH_NEXT_PATH_WINDOW_NAME_PREFIX}${nextPath}`)};
      } catch (error) {}
      window.location.replace(${JSON.stringify(loginHref)});
    </script>
    <p>Redirecting to <a href="${escapeHtml(loginHref)}">login</a>…</p>
  </body>
</html>`,
    {
      status: 200,
      headers: {
        'Cache-Control': cacheControl,
        'Content-Security-Policy': buildSiteCsp({ nonce, currentOrigin, pathname }),
        'Content-Type': 'text/html; charset=utf-8'
      }
    }
  )

export const createProtectedFeatureRouteHandler = (
  featureId: TemplateFeatureId,
  cacheControl: string
): RequestHandler =>
  createFeatureRouteHandler(featureId, async (event) => {
    event.headers.set('Cache-Control', cacheControl)
    if (isStaticShellBuild()) {
      return
    }
    const session = await loadAuthSession(event.request)
    if (session.status !== 'authenticated') {
      const currentUrl = new URL(event.request.url)
      const nonce = getOrCreateRequestCspNonce(event)
      const nextPath = resolveInternalNextPath(
        `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
        currentUrl.origin
      )
      return createClientLoginRedirectResponse({
        loginHref: buildLoginRedirectHref(event.request),
        nextPath,
        cacheControl,
        nonce,
        currentOrigin: currentUrl.origin,
        pathname: currentUrl.pathname
      })
    }
  })

export const resolveInternalNextPath = (
  value: string | null | undefined,
  origin: string,
  fallback = '/profile'
) => {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return fallback

  try {
    const nextUrl = new URL(trimmed, origin)
    if (nextUrl.origin !== origin) return fallback
    return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}` || fallback
  } catch {
    return fallback
  }
}

export const buildLoginRedirectHref = (request: Request, fallback = '/profile') => {
  const currentUrl = new URL(request.url)
  const loginUrl = new URL('/login/', currentUrl.origin)
  const requestedLang = currentUrl.searchParams.get('lang')?.trim()
  if (requestedLang) {
    loginUrl.searchParams.set('lang', requestedLang)
  }

  return `${loginUrl.pathname}${loginUrl.search}${loginUrl.hash}`
}
