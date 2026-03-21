type StoreMutationRouteError = {
  message: string
  status: number
}

const jsonResponseHeaders = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8'
}

const readJsonBody = async <T>(request: Request) => {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const parseNumber = (value: unknown) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : Number.NaN
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : Number.NaN
  }
  return Number.NaN
}

const parseInteger = (value: unknown) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.trunc(value) : Number.NaN
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : Number.NaN
  }
  return Number.NaN
}

export const createStoreMutationJsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: jsonResponseHeaders
  })

export const createStoreMutationErrorResponse = (status: number, error: string) =>
  createStoreMutationJsonResponse({ error }, status)

export const normalizeStoreMutationRouteError = (error: unknown): StoreMutationRouteError => {
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    'status' in error &&
    typeof error.message === 'string' &&
    typeof error.status === 'number'
  ) {
    return { message: error.message, status: error.status }
  }

  if (error instanceof Error && error.message.trim() !== '') {
    return { message: error.message, status: 500 }
  }

  return { message: 'Store mutation failed', status: 500 }
}

export const parseStoreItemIdParam = (value: string | undefined) => {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }
  return parsed
}

export const parseCreateStoreItemInput = async (request: Request) => {
  const payload = await readJsonBody<Record<string, unknown>>(request)
  if (!isRecord(payload)) return null

  const name = typeof payload.name === 'string' ? payload.name.trim() : ''
  const price = parseNumber(payload.price)
  const quantity = parseInteger(payload.quantity)

  if (name.length < 2) return null
  if (!Number.isFinite(price) || price < 0) return null
  if (!Number.isFinite(quantity) || (quantity !== -1 && quantity <= 0)) return null

  return { name, price, quantity }
}

export const parseRestoreStoreItemInput = async (request: Request) => {
  const payload = await readJsonBody<Record<string, unknown>>(request)
  if (!isRecord(payload)) return null
  const amount = parseInteger(payload.amount)
  if (!Number.isFinite(amount) || amount <= 0) return null
  return { amount }
}
