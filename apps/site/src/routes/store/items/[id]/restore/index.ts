import type { RequestHandler } from '@builder.io/qwik-city'
import { createFeatureRouteHandler } from '../../../../route-utils'
import {
  createStoreMutationErrorResponse,
  createStoreMutationJsonResponse,
  normalizeStoreMutationRouteError,
  parseRestoreStoreItemInput,
  parseStoreItemIdParam
} from '../../../../../features/store/store-mutation-http'
import { restoreServerStoreItem } from '../../../../../features/store/store-mutation.server'

export const onPost: RequestHandler = createFeatureRouteHandler('store', async ({ params, request }) => {
  const id = parseStoreItemIdParam(params.id)
  if (!id) {
    return createStoreMutationErrorResponse(400, 'Invalid store item id.')
  }

  const input = await parseRestoreStoreItemInput(request)
  if (!input) {
    return createStoreMutationErrorResponse(400, 'Invalid restore amount.')
  }

  try {
    const item = await restoreServerStoreItem(request, id, input.amount)
    return createStoreMutationJsonResponse({ item })
  } catch (error) {
    const normalized = normalizeStoreMutationRouteError(error)
    return createStoreMutationErrorResponse(normalized.status, normalized.message)
  }
})
