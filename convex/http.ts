import { httpRouter } from 'convex/server'
import { components } from './_generated/api'
import { type ActionCtx, httpAction } from './_generated/server'
import { createAuth, resolveAuthBasePath, resolveTrustedOrigins } from './auth'
import {
  createFacebookDataDeletionStatus,
  decodeFacebookDataDeletionStatusToken,
  encodeFacebookDataDeletionStatusToken,
  facebookDataDeletionPath,
  facebookDataDeletionStatusPath,
  parseFacebookSignedRequest,
  renderFacebookDataDeletionStatusPage
} from './facebookDataDeletion'

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

const resolveRequestForwardedOrigin = (request: Request) => {
  const requestUrl = new URL(request.url)
  const forwardedHost = resolveHeaderValue(request, 'x-forwarded-host')
  const forwardedProto = resolveHeaderValue(request, 'x-forwarded-proto')
  const host = forwardedHost ?? resolveHeaderValue(request, 'host') ?? requestUrl.host
  const protocol = forwardedProto ?? requestUrl.protocol.replace(/:$/, '') ?? 'https'
  return normalizeOrigin(`${protocol}://${host}`)
}

const resolveAuthRequestOrigin = (request: Request) => {
  const origin = normalizeOrigin(resolveHeaderValue(request, 'origin'))
  if (origin) return origin

  const forwardedOrigin = resolveRequestForwardedOrigin(request)
  if (forwardedOrigin) return forwardedOrigin

  const referer = normalizeOrigin(resolveHeaderValue(request, 'referer'))
  if (referer && resolveTrustedOrigins().includes(referer)) return referer

  return resolveRequestForwardedOrigin(request) ?? 'https://prometheus.prod'
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

const normalizeFacebookAppSecret = () => {
  const trimmed = process.env.AUTH_FACEBOOK_CLIENT_SECRET?.trim()
  return trimmed ? trimmed : undefined
}

const getDeleteManyPagination = (numItems = 1000) => ({
  cursor: null,
  numItems
})

const extractFacebookSignedRequest = async (request: Request) => {
  const requestUrl = new URL(request.url)
  const querySignedRequest = normalizeOptionalString(requestUrl.searchParams.get('signed_request'))
  if (querySignedRequest) return querySignedRequest

  const contentType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  if (contentType === 'application/json') {
    const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const signedRequest = payload && typeof payload.signed_request === 'string' ? payload.signed_request : undefined
    return normalizeOptionalString(signedRequest)
  }

  if (contentType === 'multipart/form-data') {
    const formData = await request.formData().catch(() => null)
    const signedRequest = formData?.get('signed_request')
    return typeof signedRequest === 'string' ? normalizeOptionalString(signedRequest) : undefined
  }

  const bodyText = await request.text()
  if (!bodyText) return undefined
  return normalizeOptionalString(new URLSearchParams(bodyText).get('signed_request'))
}

const deleteFacebookLinkedAuthData = async (ctx: ActionCtx, facebookUserId: string) => {
  const facebookAccount = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: 'account',
    select: ['userId'],
    where: [
      {
        field: 'providerId',
        operator: 'eq',
        value: 'facebook'
      },
      {
        connector: 'AND',
        field: 'accountId',
        operator: 'eq',
        value: facebookUserId
      }
    ]
  })) as { userId?: string } | null

  const userId = typeof facebookAccount?.userId === 'string' && facebookAccount.userId.trim() ? facebookAccount.userId : undefined
  if (!userId) {
    return false
  }

  await Promise.all([
    ctx.runMutation(components.betterAuth.adapter.deleteMany, {
      input: {
        model: 'session',
        where: [
          {
            field: 'userId',
            operator: 'eq',
            value: userId
          }
        ]
      },
      paginationOpts: getDeleteManyPagination()
    }),
    ctx.runMutation(components.betterAuth.adapter.deleteMany, {
      input: {
        model: 'account',
        where: [
          {
            field: 'userId',
            operator: 'eq',
            value: userId
          }
        ]
      },
      paginationOpts: getDeleteManyPagination()
    }),
    ctx.runMutation(components.betterAuth.adapter.deleteMany, {
      input: {
        model: 'oauthAccessToken',
        where: [
          {
            field: 'userId',
            operator: 'eq',
            value: userId
          }
        ]
      },
      paginationOpts: getDeleteManyPagination()
    }),
    ctx.runMutation(components.betterAuth.adapter.deleteMany, {
      input: {
        model: 'oauthConsent',
        where: [
          {
            field: 'userId',
            operator: 'eq',
            value: userId
          }
        ]
      },
      paginationOpts: getDeleteManyPagination()
    }),
    ctx.runMutation(components.betterAuth.adapter.deleteOne, {
      input: {
        model: 'twoFactor',
        where: [
          {
            field: 'userId',
            operator: 'eq',
            value: userId
          }
        ]
      }
    })
  ])

  await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
    input: {
      model: 'user',
      where: [
        {
          field: 'userId',
          operator: 'eq',
          value: userId
        }
      ]
    }
  })

  return true
}

const buildFacebookDeletionStatusUrl = ({
  request,
  token
}: {
  request: Request
  token: string
}) => {
  const statusUrl = new URL(facebookDataDeletionStatusPath, resolveAuthRequestOrigin(request))
  statusUrl.searchParams.set('token', token)
  return statusUrl.toString()
}

const handleFacebookDataDeletionInfo = httpAction(async (_ctx, request) => {
  const origin = resolveAuthRequestOrigin(request)
  return new Response(
    JSON.stringify(
      {
        callback_url: new URL(facebookDataDeletionPath, origin).toString(),
        status_url_template: `${new URL(facebookDataDeletionStatusPath, origin).toString()}?token=<signed-token>`,
        message: 'Submit a POST request with the Facebook signed_request payload to process a data deletion request.'
      },
      null,
      2
    ),
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      status: 200
    }
  )
})

const handleFacebookDataDeletionRequest = httpAction(async (ctx, request) => {
  try {
    const appSecret = normalizeFacebookAppSecret()
    if (!appSecret) {
      return Response.json(
        {
          code: 'FACEBOOK_DELETION_NOT_CONFIGURED',
          message: 'Facebook data deletion is not configured on this deployment.'
        },
        {
          status: 503
        }
      )
    }

    const signedRequest = await extractFacebookSignedRequest(request)
    const payload = await parseFacebookSignedRequest(signedRequest ?? '', appSecret)
    const matchFound = await deleteFacebookLinkedAuthData(ctx, payload.user_id)
    const deletionStatus = createFacebookDataDeletionStatus({
      matchFound
    })
    const token = await encodeFacebookDataDeletionStatusToken(deletionStatus, appSecret)

    return Response.json({
      confirmation_code: deletionStatus.confirmationCode,
      url: buildFacebookDeletionStatusUrl({
        request,
        token
      })
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Facebook deletion request failed.'
    const status = /not configured/i.test(message) ? 503 : 400
    return Response.json(
      {
        code: 'FACEBOOK_DELETION_REQUEST_ERROR',
        message
      },
      {
        status
      }
    )
  }
})

const handleFacebookDataDeletionStatus = httpAction(async (_ctx, request) => {
  try {
    const appSecret = normalizeFacebookAppSecret()
    if (!appSecret) {
      return new Response('Facebook data deletion is not configured on this deployment.', {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8'
        },
        status: 503
      })
    }

    const token = normalizeOptionalString(new URL(request.url).searchParams.get('token'))
    const status = await decodeFacebookDataDeletionStatusToken(token ?? '', appSecret)
    return new Response(
      renderFacebookDataDeletionStatusPage({
        origin: resolveAuthRequestOrigin(request),
        status
      }),
      {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store'
        },
        status: 200
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load deletion status.'
    return new Response(message, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store'
      },
      status: 400
    })
  }
})

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
  method: 'GET',
  path: facebookDataDeletionPath,
  handler: handleFacebookDataDeletionInfo
})

http.route({
  method: 'POST',
  path: facebookDataDeletionPath,
  handler: handleFacebookDataDeletionRequest
})

http.route({
  method: 'GET',
  path: facebookDataDeletionStatusPath,
  handler: handleFacebookDataDeletionStatus
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
