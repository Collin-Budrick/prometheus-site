import type { RequestHandler } from '@builder.io/qwik-city'
import { createFeatureRouteHandler } from '../../../feature-bundle'
import {
  createStoreMutationErrorResponse,
  createStoreMutationJsonResponse,
  normalizeStoreMutationRouteError,
  parseStoreItemIdParam
} from '../../../../shared/store-mutation-http'
import { deleteServerStoreItem } from '../../../../shared/store-mutation.server'

export const onDelete: RequestHandler = createFeatureRouteHandler('store', async ({ params, request }) => {
  const id = parseStoreItemIdParam(params.id)
  if (!id) {
    return createStoreMutationErrorResponse(400, 'Invalid store item id.')
  }

  try {
    const result = await deleteServerStoreItem(request, id)
    return createStoreMutationJsonResponse(result)
  } catch (error) {
    const normalized = normalizeStoreMutationRouteError(error)
    return createStoreMutationErrorResponse(normalized.status, normalized.message)
  }
})
