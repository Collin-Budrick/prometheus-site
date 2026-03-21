import type { RequestEvent, RequestHandler } from '@builder.io/qwik-city'
import type { TemplateFeatureId } from '@prometheus/template-config'
import { isSiteFeatureEnabled } from '../site-config'

export const PUBLIC_SWR_CACHE = 'public, max-age=0, s-maxage=30, stale-while-revalidate=120'
// Keep authenticated pages out of shared caches without disabling browser revalidation and bfcache.
export const PRIVATE_REVALIDATE_CACHE = 'private, no-cache, max-age=0, must-revalidate'

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
