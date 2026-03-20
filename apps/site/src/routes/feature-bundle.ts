import type { RequestEvent, RequestHandler } from '@builder.io/qwik-city'
import type { TemplateFeatureId } from '@prometheus/template-config'
import { isSiteFeatureEnabled } from '../template-features'

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
