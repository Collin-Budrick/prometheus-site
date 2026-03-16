import type { RequestHandler } from '@builder.io/qwik-city'
import {
  createStoreMutationErrorResponse,
  createStoreMutationJsonResponse,
  normalizeStoreMutationRouteError,
  parseRestoreStoreItemInput,
  parseStoreItemIdParam
} from '../../../../../shared/store-mutation-http'
import { restoreServerStoreItem } from '../../../../../shared/store-mutation.server'

export const onPost: RequestHandler = async ({ params, request }) => {
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
}
