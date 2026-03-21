import type { RequestHandler } from '@builder.io/qwik-city'
import { createFeatureRouteHandler } from '../../feature-bundle'
import {
  createStoreMutationErrorResponse,
  createStoreMutationJsonResponse,
  normalizeStoreMutationRouteError,
  parseCreateStoreItemInput
} from '../../../features/store/store-mutation-http'
import { createServerStoreItem } from '../../../features/store/store-mutation.server'

export const onPost: RequestHandler = createFeatureRouteHandler('store', async ({ request }) => {
  const input = await parseCreateStoreItemInput(request)
  if (!input) {
    return createStoreMutationErrorResponse(400, 'Invalid store item payload.')
  }

  try {
    const item = await createServerStoreItem(request, input)
    return createStoreMutationJsonResponse({ item }, 201)
  } catch (error) {
    const normalized = normalizeStoreMutationRouteError(error)
    return createStoreMutationErrorResponse(normalized.status, normalized.message)
  }
})
