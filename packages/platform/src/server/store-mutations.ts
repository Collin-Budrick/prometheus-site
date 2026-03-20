import type { AnyElysia } from 'elysia'
import { readSiteSessionClaims } from '@features/auth/server'
import { DbConnection } from '../../../spacetimedb-client/src/index'
import { platformConfig } from '../config'

type StoreConnection = InstanceType<typeof DbConnection>

type StoreMutationError = {
  message: string
  status: number
}

type StoreItem = {
  id: number
  name: string
  price: number
  quantity: number
}

const STORE_MUTATION_TIMEOUT_MS = 4_000

const jsonHeaders = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8'
}

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: jsonHeaders
  })

const errorResponse = (status: number, error: string) => jsonResponse({ error }, status)

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const parseStoreItem = (value: unknown): StoreItem | null => {
  if (!isRecord(value)) return null
  const id = parseInteger(value.id)
  const price = parseNumber(value.price)
  const quantity = parseInteger(value.quantity)
  const name = typeof value.name === 'string' ? value.name.trim() : ''

  if (!Number.isFinite(id) || id <= 0) return null
  if (!Number.isFinite(price) || !Number.isFinite(quantity)) return null

  return {
    id,
    name: name || `Item ${id}`,
    price,
    quantity
  }
}

const parseReducerErrorStatus = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()
  if (normalized.includes('out of stock')) return 409
  if (normalized.includes('not found')) return 404
  if (normalized.includes('authentication required')) return 401
  if (normalized.includes('admin role required')) return 403
  return 500
}

const normalizeMutationError = (error: unknown): StoreMutationError => {
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

  const status = parseReducerErrorStatus(error)
  const message =
    error instanceof Error && error.message.trim() !== ''
      ? error.message
      : status === 409
        ? 'Out of stock'
        : status === 404
          ? 'Item not found'
          : 'Store mutation failed'

  return { message, status }
}

const readBearerToken = (request: Request) => {
  const value = request.headers.get('authorization')?.trim() ?? ''
  if (!value) return null
  const match = value.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

const hasAdminRole = (roles: string[] | undefined) =>
  Array.isArray(roles) && roles.some((role) => role.trim().toLowerCase() === 'admin')

const resolveStoreMutationAuth = async (request: Request) => {
  if (!platformConfig.auth) {
    return {
      roles: [] as string[],
      token: readBearerToken(request)
    }
  }

  const siteSession = await readSiteSessionClaims(platformConfig.auth, { request })
  const siteToken =
    typeof siteSession?.id_token === 'string' && siteSession.id_token.trim() !== ''
      ? siteSession.id_token.trim()
      : null
  if (siteToken) {
    return {
      roles: siteSession?.roles ?? [],
      token: siteToken
    }
  }

  return {
    roles: [] as string[],
    token: readBearerToken(request)
  }
}

const requireAdminStoreMutationAuth = async (request: Request) => {
  const auth = await resolveStoreMutationAuth(request)
  if (!auth.token) {
    throw {
      message: 'Authentication required',
      status: 401
    } satisfies StoreMutationError
  }
  if (auth.roles.length > 0 && !hasAdminRole(auth.roles)) {
    throw {
      message: 'Admin role required',
      status: 403
    } satisfies StoreMutationError
  }
  return auth
}

const requireStoreMutationAuth = async (request: Request) => {
  const auth = await resolveStoreMutationAuth(request)
  if (!auth.token) {
    throw {
      message: 'Authentication required',
      status: 401
    } satisfies StoreMutationError
  }
  return auth
}

const connectToStoreDatabase = (token?: string | null) =>
  new Promise<StoreConnection>((resolve, reject) => {
    let settled = false
    let connection: StoreConnection | null = null

    const finish = (value?: StoreConnection, error?: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      if (error) {
        try {
          connection?.disconnect()
        } catch {
          // Ignore connection cleanup failures after a failed connect.
        }
        reject(error)
        return
      }
      resolve(value as StoreConnection)
    }

    const timeoutId = setTimeout(() => {
      finish(undefined, new Error(`Timed out connecting to ${platformConfig.spacetime.uri}`))
    }, STORE_MUTATION_TIMEOUT_MS)

    try {
      connection = DbConnection.builder()
        .withUri(platformConfig.spacetime.uri)
        .withDatabaseName(platformConfig.spacetime.moduleName)
        .withCompression('gzip')
        .withLightMode(true)
        .withToken(token ?? undefined)
        .onConnect((nextConnection) => {
          connection = nextConnection
          finish(nextConnection)
        })
        .onConnectError((_, error) => {
          finish(undefined, error)
        })
        .onDisconnect((_, error) => {
          if (!settled) {
            finish(undefined, error ?? new Error('Store database connection closed before mutation completed.'))
          }
        })
        .build()
    } catch (error) {
      finish(undefined, error)
    }
  })

const withStoreConnection = async <T>(
  request: Request,
  runner: (connection: StoreConnection) => Promise<T>
) => {
  const { token } = await resolveStoreMutationAuth(request)
  const connection = await connectToStoreDatabase(token)
  try {
    return await runner(connection)
  } finally {
    try {
      connection.disconnect()
    } catch {
      // Ignore teardown failures after completing the mutation.
    }
  }
}

const loadStoreInventory = async (limit = 500) =>
  new Promise<StoreItem[]>((resolve, reject) => {
    let settled = false
    let connection: StoreConnection | null = null
    let subscription:
      | {
          isEnded?: () => boolean
          unsubscribe?: () => void
        }
      | null = null

    const finish = (value?: StoreItem[], error?: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      try {
        if (subscription && typeof subscription.unsubscribe === 'function') {
          if (typeof subscription.isEnded !== 'function' || !subscription.isEnded()) {
            subscription.unsubscribe()
          }
        }
      } catch {
        // Ignore subscription cleanup failures after mutation reads.
      }
      try {
        connection?.disconnect()
      } catch {
        // Ignore connection cleanup failures after mutation reads.
      }
      if (error) {
        reject(error)
        return
      }
      resolve(value ?? [])
    }

    const timeoutId = setTimeout(() => {
      finish(undefined, new Error(`Timed out loading store inventory after ${STORE_MUTATION_TIMEOUT_MS}ms`))
    }, STORE_MUTATION_TIMEOUT_MS)

    try {
      connection = DbConnection.builder()
        .withUri(platformConfig.spacetime.uri)
        .withDatabaseName(platformConfig.spacetime.moduleName)
        .withCompression('gzip')
        .withLightMode(true)
        .onConnect((nextConnection) => {
          connection = nextConnection
          subscription = nextConnection
            .subscriptionBuilder()
            .onApplied(() => {
              const items = Array.from(nextConnection.db.store_item.iter())
                .map((row) => parseStoreItem(row))
                .filter((item): item is StoreItem => item !== null)
                .sort((left, right) => left.id - right.id)
                .slice(0, Math.max(1, limit))
              finish(items)
            })
            .onError((ctx) => {
              finish(undefined, new Error(ctx.event?.message ?? 'Store subscription failed.'))
            })
            .subscribe('SELECT * FROM store_item')
        })
        .onConnectError((_, error) => {
          finish(undefined, error)
        })
        .onDisconnect((_, error) => {
          if (!settled) {
            finish(undefined, error ?? new Error('Store inventory connection closed before data loaded.'))
          }
        })
        .build()
    } catch (error) {
      finish(undefined, error)
    }
  })

const loadStoreItem = async (id: number) => {
  const items = await loadStoreInventory(500)
  return items.find((item) => item.id === id) ?? null
}

const parseStoreItemId = (value: string | undefined) => {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

const parseCreateStoreItemInput = (payload: unknown) => {
  if (!isRecord(payload)) return null

  const name = typeof payload.name === 'string' ? payload.name.trim() : ''
  const price = parseNumber(payload.price)
  const quantity = parseInteger(payload.quantity)

  if (name.length < 2) return null
  if (!Number.isFinite(price) || price < 0) return null
  if (!Number.isFinite(quantity) || (quantity !== -1 && quantity <= 0)) return null

  return { name, price, quantity }
}

const parseRestoreInput = (payload: unknown) => {
  if (!isRecord(payload)) return null
  const amount = parseInteger(payload.amount)
  if (!Number.isFinite(amount) || amount <= 0) return null
  return { amount }
}

const createStoreItem = async (
  request: Request,
  input: { name: string; price: number; quantity: number }
) => {
  await requireAdminStoreMutationAuth(request)
  const beforeItems = await loadStoreInventory(500)
  const beforeIds = new Set(beforeItems.map((item) => item.id))

  try {
    await withStoreConnection(request, async (connection) => {
      await connection.reducers.createStoreItem(input)
    })
  } catch (error) {
    throw normalizeMutationError(error)
  }

  const afterItems = await loadStoreInventory(500)
  const created =
    afterItems.find((item) => !beforeIds.has(item.id) && item.name === input.name) ??
    afterItems.find((item) => !beforeIds.has(item.id)) ??
    null

  if (!created) {
    throw { message: 'Created item was not returned by the store database.', status: 500 }
  }

  return created
}

const deleteStoreItem = async (request: Request, id: number) => {
  await requireAdminStoreMutationAuth(request)
  try {
    await withStoreConnection(request, async (connection) => {
      await connection.reducers.deleteStoreItem({ id: BigInt(id) })
    })
  } catch (error) {
    throw normalizeMutationError(error)
  }

  return { deleted: true, id }
}

const consumeStoreItem = async (request: Request, id: number) => {
  await requireStoreMutationAuth(request)
  try {
    await withStoreConnection(request, async (connection) => {
      await connection.reducers.consumeStoreItem({ id: BigInt(id) })
    })
  } catch (error) {
    throw normalizeMutationError(error)
  }

  const item = await loadStoreItem(id)
  if (!item) {
    throw { message: 'Item not found', status: 404 }
  }

  return item
}

const restoreStoreItem = async (request: Request, id: number, amount: number) => {
  await requireStoreMutationAuth(request)
  try {
    await withStoreConnection(request, async (connection) => {
      await connection.reducers.restoreStoreItem({ amount, id: BigInt(id) })
    })
  } catch (error) {
    throw normalizeMutationError(error)
  }

  const item = await loadStoreItem(id)
  if (!item) {
    throw { message: 'Item not found', status: 404 }
  }

  return item
}

export const createStoreMutationRoutes = (app: AnyElysia) => {
  app.post('/store/items', async ({ body, request }) => {
    const input = parseCreateStoreItemInput(body)
    if (!input) {
      return errorResponse(400, 'Invalid store item payload.')
    }

    try {
      const item = await createStoreItem(request, input)
      return jsonResponse({ item }, 201)
    } catch (error) {
      const normalized = normalizeMutationError(error)
      return errorResponse(normalized.status, normalized.message)
    }
  })

  app.delete('/store/items/:id', async ({ params, request }) => {
    const id = parseStoreItemId(params.id)
    if (!id) {
      return errorResponse(400, 'Invalid store item id.')
    }

    try {
      const result = await deleteStoreItem(request, id)
      return jsonResponse(result)
    } catch (error) {
      const normalized = normalizeMutationError(error)
      return errorResponse(normalized.status, normalized.message)
    }
  })

  app.post('/store/items/:id/consume', async ({ params, request }) => {
    const id = parseStoreItemId(params.id)
    if (!id) {
      return errorResponse(400, 'Invalid store item id.')
    }

    try {
      const item = await consumeStoreItem(request, id)
      return jsonResponse({ item })
    } catch (error) {
      const normalized = normalizeMutationError(error)
      return errorResponse(normalized.status, normalized.message)
    }
  })

  app.post('/store/items/:id/restore', async ({ body, params, request }) => {
    const id = parseStoreItemId(params.id)
    if (!id) {
      return errorResponse(400, 'Invalid store item id.')
    }

    const input = parseRestoreInput(body)
    if (!input) {
      return errorResponse(400, 'Invalid restore amount.')
    }

    try {
      const item = await restoreStoreItem(request, id, input.amount)
      return jsonResponse({ item })
    } catch (error) {
      const normalized = normalizeMutationError(error)
      return errorResponse(normalized.status, normalized.message)
    }
  })

  return app
}
