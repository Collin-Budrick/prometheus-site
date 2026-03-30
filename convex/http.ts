import { httpRouter } from 'convex/server'
import { httpAction } from './_generated/server'
import { createAuth, resolveAuthBasePath, resolveTrustedOrigins } from './auth'

const http = httpRouter()
const authBasePath = resolveAuthBasePath()
const authRoutePrefix = `${authBasePath}/`
const corsAllowedHeaders = ['Content-Type', 'Better-Auth-Cookie', 'Authorization']
const corsExposedHeaders = ['Set-Better-Auth-Cookie']

const normalizeOptionalString = (value: string | null | undefined) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

const normalizeOrigin = (value: string | undefined) => {
  const trimmed = normalizeOptionalString(value)
  if (!trimmed) return undefined
  try {
    const url = new URL(trimmed)
    url.pathname = ''
    url.search = ''
    url.hash = ''
    return url.origin
  } catch {
    return undefined
  }
}

const resolveHeaderValue = (request: Request, name: string) =>
  normalizeOptionalString(request.headers.get(name)?.split(',')[0])

const resolveCorsOrigin = (request: Request) => {
  const origin = normalizeOrigin(resolveHeaderValue(request, 'origin'))
  if (!origin) return undefined
  return resolveTrustedOrigins().includes(origin) ? origin : undefined
}

const withCorsHeaders = (request: Request, response: Response) => {
  const origin = resolveCorsOrigin(request)
  if (!origin) return response

  const headers = new Headers(response.headers)
  const vary = headers.get('Vary')
  headers.set('Access-Control-Allow-Credentials', 'true')
  headers.set('Access-Control-Allow-Origin', origin)
  headers.set('Access-Control-Expose-Headers', corsExposedHeaders.join(', '))
  headers.set('Vary', vary ? `${vary}, Origin` : 'Origin')
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText
  })
}

const toPlainResponse = async (response: Response) => {
  const headers = new Headers(response.headers)
  const body = response.body ? await response.arrayBuffer() : undefined
  return new Response(body && body.byteLength > 0 ? body : null, {
    headers,
    status: response.status,
    statusText: response.statusText
  })
}

const handleAuthPreflight = httpAction(async (_ctx, request) => {
  const headers = new Headers()
  const origin = resolveCorsOrigin(request)
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Access-Control-Allow-Credentials', 'true')
    headers.set('Access-Control-Expose-Headers', corsExposedHeaders.join(', '))
    headers.set('Vary', 'Origin')
  }
  headers.set('Access-Control-Allow-Headers', corsAllowedHeaders.join(', '))
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  return new Response(null, {
    headers,
    status: 204
  })
})

const resolveAuthRequestOrigin = (request: Request) => {
  const origin = normalizeOrigin(resolveHeaderValue(request, 'origin'))
  if (origin) return origin

  const referer = normalizeOrigin(resolveHeaderValue(request, 'referer'))
  if (referer) return referer

  const requestUrl = new URL(request.url)
  const forwardedHost = resolveHeaderValue(request, 'x-forwarded-host')
  const forwardedProto = resolveHeaderValue(request, 'x-forwarded-proto')
  const host = resolveHeaderValue(request, 'host') ?? requestUrl.host
  const protocol = forwardedProto ?? requestUrl.protocol.replace(/:$/, '') ?? 'https'
  return `${protocol}://${host}`
}

const buildNormalizedAuthRequest = async (request: Request) => {
  const requestUrl = new URL(request.url)
  const pathname = requestUrl.pathname.startsWith('/http/') ? requestUrl.pathname.slice('/http'.length) : requestUrl.pathname
  const targetUrl = new URL(`${pathname}${requestUrl.search}`, resolveAuthRequestOrigin(request))
  const headers = new Headers(request.headers)
  headers.set('host', targetUrl.host)
  headers.set('x-forwarded-host', targetUrl.host)
  headers.set('x-forwarded-proto', targetUrl.protocol.replace(/:$/, ''))

  const init: RequestInit = {
    headers,
    method: request.method,
    redirect: 'manual'
  }

  if (!['GET', 'HEAD'].includes(request.method.toUpperCase())) {
    const body = await request.arrayBuffer()
    if (body.byteLength > 0) {
      init.body = body
    }
  }

  return new Request(targetUrl.toString(), init)
}

const handleAuthRequest = httpAction(async (ctx, request) => {
  try {
    const normalizedRequest = await buildNormalizedAuthRequest(request)
    const response = await createAuth(ctx as unknown as Record<string, unknown>).handler(normalizedRequest)
    return withCorsHeaders(request, await toPlainResponse(response))
  } catch (error) {
    console.error('[better-auth:http]', {
      error:
        error instanceof Error
          ? {
              message: error.message,
              name: error.name,
              stack: error.stack
            }
          : error,
      method: request.method,
      url: request.url
    })
    return withCorsHeaders(
      request,
      Response.json(
        {
          code: 'AUTH_ROUTE_ERROR',
          message: 'Authentication request failed.'
        },
        {
          status: 500
        }
      )
    )
  }
})

http.route({
  method: 'GET',
  path: '/.well-known/openid-configuration',
  handler: httpAction(async (_ctx, request) =>
    Response.redirect(new URL(`${authBasePath}/convex/.well-known/openid-configuration`, resolveAuthRequestOrigin(request)))
  )
})

http.route({
  method: 'OPTIONS',
  path: authBasePath,
  handler: handleAuthPreflight
})

http.route({
  method: 'OPTIONS',
  pathPrefix: authRoutePrefix,
  handler: handleAuthPreflight
})

http.route({
  method: 'GET',
  path: authBasePath,
  handler: handleAuthRequest
})

http.route({
  method: 'GET',
  pathPrefix: authRoutePrefix,
  handler: handleAuthRequest
})

http.route({
  method: 'POST',
  path: authBasePath,
  handler: handleAuthRequest
})

http.route({
  method: 'POST',
  pathPrefix: authRoutePrefix,
  handler: handleAuthRequest
})

export default http
