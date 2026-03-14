import { mock } from 'bun:test'
import { Elysia } from 'elysia'
import { storeItems, chatMessages } from '@platform/db/schema'
import { createRateLimiter } from '@platform/rate-limit'

type AuthSession = { id: string; userId: string }

const defaultStoreItems = Array.from({ length: 15 }, (_, index) => ({
  id: index + 1,
  name: `Item ${index + 1}`,
  price: Number(((index + 1) * 3).toFixed(2)),
  quantity: index + 1,
  createdAt: new Date(2024, 0, index + 1)
}))

const defaultChatMessages = [
  { id: 1, author: 'alice', body: 'Hello from Alice', createdAt: new Date('2024-01-01T00:00:00Z') },
  { id: 2, author: 'bob', body: 'Reply from Bob', createdAt: new Date('2024-01-02T00:00:00Z') }
]

export const storeItemsData = structuredClone(defaultStoreItems)
export const chatMessagesData = structuredClone(defaultChatMessages)
export const authUsersData = [
  { id: 'user-1', email: 'existing@example.com', name: 'Existing User' }
]
export const authSessionsData: AuthSession[] = []

let nextChatId = chatMessagesData.length + 1
let nextSessionId = 1

const cacheStorage = new Map<string, string>()
const valkeyCounters = new Map<string, { count: number; expiry: number }>()
const valkeyHashes = new Map<string, Record<string, number>>()
export const cacheKeysWritten: string[] = []
export const publishedMessages: string[] = []
const subscribers: ((message: string) => void)[] = []

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const stripValkeyCommandOptions = <T>(args: T[]) => {
  if (args.length === 0) return args
  return typeof args[0] === 'string' || Array.isArray(args[0]) ? args : args.slice(1)
}

const flattenValkeyKeys = (args: unknown[]) =>
  stripValkeyCommandOptions(args).flatMap((value) => (Array.isArray(value) ? value : [value]))

const extractThreshold = (condition: unknown) => {
  if (!isRecord(condition)) return null
  const sql = condition.queryChunks
  if (!Array.isArray(sql)) return null
  for (const chunk of sql) {
    if (!isRecord(chunk)) continue
    const value = chunk.value
    if (typeof value === 'number') {
      return value
    }
  }
  return null
}

const buildQuery = <TRow extends { id: number; createdAt?: Date }>(rows: TRow[], table: unknown) => ({
  where(condition: unknown) {
    const threshold = extractThreshold(condition)
    if (typeof threshold === 'number') {
      const filtered = rows.filter((row) => row.id > threshold)
      return buildQuery(filtered, table)
    }
    return buildQuery(rows, table)
  },
  orderBy(_order: unknown) {
    const sorted = [...rows]
    if (table === chatMessages) {
      sorted.sort((a, b) => b.createdAt!.getTime() - a.createdAt!.getTime())
    } else {
      sorted.sort((a, b) => a.id - b.id)
    }
    return buildQuery(sorted, table)
  },
  async limit(limit: number) {
    return rows.slice(0, limit)
  }
})

const fakeDb = {
  select() {
    return {
      from(table: unknown) {
        const rows = table === storeItems ? storeItemsData : chatMessagesData
        return buildQuery(rows, table)
      }
    }
  },
  insert(table: unknown) {
    return {
      async values(rows: { author: string; body: string } | { author: string; body: string }[]) {
        if (table === chatMessages) {
          const payloads = Array.isArray(rows) ? rows : [rows]
          payloads.forEach((row) => {
            chatMessagesData.push({ id: nextChatId, createdAt: new Date(), ...row })
            nextChatId += 1
          })
        }
      }
    }
  }
}

const pgClient = Object.assign(
  async (..._args: unknown[]) => {},
  {
    async end() {},
    async query() {},
    async listen(_channel: string, _handler: (payload: string) => void, onListen?: () => void) {
      onListen?.()
      return {
        async unlisten() {}
      }
    }
  }
)

const authJson = (body: unknown, init?: ResponseInit) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (init?.headers) {
    Object.assign(headers, init.headers)
  }
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers
  })
}

const createSession = (userId: string) => {
  const id = `sess-${nextSessionId}`
  nextSessionId += 1
  const cookie = `session=${id}; Path=/; HttpOnly; SameSite=Lax`
  authSessionsData.push({ id, userId })
  return { id, cookie }
}

const getSessionIdFromHeaders = (headers?: HeadersInit) => {
  const cookies = new Headers(headers).get('cookie') ?? ''
  const match = cookies.match(/session=([^;]+)/)
  return match ? match[1] : null
}

const validateSession = async (context?: { request?: Request; headers?: HeadersInit }) => {
  const sessionId = getSessionIdFromHeaders(context?.headers ?? context?.request?.headers)
  if (sessionId === null) return authJson({ user: null, session: null })

  const session = authSessionsData.find((record) => record.id === sessionId)
  if (session === undefined) return authJson({ user: null, session: null })

  const user = authUsersData.find((candidate) => candidate.id === session.userId)
  if (user === undefined) return authJson({ user: null, session: null })

  return authJson(
    {
      user,
      session: { token: session.id, userId: user.id, expiresAt: new Date(Date.now() + 3600_000).toISOString() }
    },
    { headers: { 'set-cookie': `session=${session.id}; Path=/; HttpOnly; SameSite=Lax` } }
  )
}

const syncSession = async (body: { idToken?: string }) => {
  if (!body.idToken) {
    return authJson({ error: 'ID token required' }, { status: 400 })
  }

  const defaultUser = authUsersData[0] ?? { id: 'user-1', email: 'existing@example.com', name: 'Existing User' }
  const session = createSession(defaultUser.id)
  return authJson(
    {
      user: defaultUser,
      session: { token: session.id, userId: defaultUser.id, expiresAt: new Date(Date.now() + 3600_000).toISOString() }
    },
    { headers: { 'set-cookie': session.cookie } }
  )
}

const logoutSession = async () =>
  authJson(
    { ok: true },
    {
      headers: {
        'set-cookie': 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
      }
    }
  )

const updateProfileName = async (
  body: { name: string },
  context?: { request?: Request; headers?: HeadersInit }
) => {
  const sessionId = getSessionIdFromHeaders(context?.headers ?? context?.request?.headers)
  if (sessionId === null) {
    return authJson({ error: 'Authentication required' }, { status: 401 })
  }

  const session = authSessionsData.find((record) => record.id === sessionId)
  const user = session ? authUsersData.find((record) => record.id === session.userId) : undefined
  if (!user) {
    return authJson({ error: 'Authentication required' }, { status: 401 })
  }

  user.name = body.name
  return authJson({ user })
}

const bootstrapSession = async (context?: { request?: Request; headers?: HeadersInit }) => {
  const sessionId = getSessionIdFromHeaders(context?.headers ?? context?.request?.headers)
  if (sessionId === null) {
    return authJson({ error: 'Authentication required' }, { status: 401 })
  }

  const session = authSessionsData.find((record) => record.id === sessionId)
  const user = session ? authUsersData.find((record) => record.id === session.userId) : undefined
  if (!user) {
    return authJson({ error: 'Authentication required' }, { status: 401 })
  }

  return authJson({
    token: 'bootstrap-token',
    user,
    issuedAt: Math.floor(Date.now() / 1000),
    expiresAt: Math.floor(Date.now() / 1000) + 3600
  })
}

const authRoutes = new Elysia({ prefix: '/auth' })
  .post('/session/sync', async ({ body }) => syncSession(body as { idToken?: string }))
  .post('/logout', async () => logoutSession())
  .post('/sign-out', async () => logoutSession())
  .post('/profile/name', async ({ body, request }) => updateProfileName(body as { name: string }, { request }))
  .post('/bootstrap', async ({ request }) => bootstrapSession({ request }))
  .get('/session', async ({ request }) => validateSession({ request }))

mock.module('@features/auth/server', () => ({
  createAuthFeature: () => ({
    auth: null,
    authRoutes,
    validateSession
  })
}))

let valkeyReady = true

type ValkeyEventName = 'ready' | 'end' | 'reconnecting' | 'error'

const createValkeyDuplicate = () => {
  const listeners: Record<ValkeyEventName, Array<() => void>> = {
    ready: [],
    end: [],
    reconnecting: [],
    error: []
  }

  const emit = (event: ValkeyEventName) => {
    listeners[event].forEach((listener) => listener())
  }

  return {
    commandOptions: valkey.commandOptions,
    get: (...args: Parameters<typeof valkey.get>) => valkey.get(...args),
    mGet: (...args: Parameters<typeof valkey.mGet>) => valkey.mGet(...args),
    set: (...args: Parameters<typeof valkey.set>) => valkey.set(...args),
    keys: (...args: Parameters<typeof valkey.keys>) => valkey.keys(...args),
    del: (...args: Parameters<typeof valkey.del>) => valkey.del(...args),
    incr: (...args: Parameters<typeof valkey.incr>) => valkey.incr(...args),
    expire: (...args: Parameters<typeof valkey.expire>) => valkey.expire(...args),
    hIncrBy: (...args: Parameters<typeof valkey.hIncrBy>) => valkey.hIncrBy(...args),
    exists: (...args: Parameters<typeof valkey.exists>) => valkey.exists(...args),
    eval: (...args: Parameters<typeof valkey.eval>) => valkey.eval(...args),
    publish: (...args: Parameters<typeof valkey.publish>) => valkey.publish(...args),
    multi: () => valkey.multi(),
    pExpire: (...args: Parameters<typeof valkey.pExpire>) => valkey.pExpire(...args),
    ping: () => valkey.ping(),
    isReady: true,
    on(event: ValkeyEventName, handler: () => void) {
      listeners[event].push(handler)
      return this
    },
    async connect() {
      this.isReady = true
      emit('ready')
    },
    async subscribe(_channel: string, handler: (message: string) => void) {
      subscribers.push(handler)
      emit('ready')
    },
    async quit() {
      this.isReady = false
      emit('end')
    }
  }
}

const valkey = {
  isOpen: true,
  commandOptions(options: Record<string, unknown>) {
    return options
  },
  async get(...args: unknown[]) {
    const [key] = stripValkeyCommandOptions(args)
    if (typeof key !== 'string') return null
    return cacheStorage.get(key) ?? null
  },
  async mGet(...args: unknown[]) {
    const [keys] = stripValkeyCommandOptions(args)
    if (!Array.isArray(keys)) return []
    return keys.map((key) => (typeof key === 'string' ? cacheStorage.get(key) ?? null : null))
  },
  async set(...args: unknown[]) {
    const [key, value, options] = stripValkeyCommandOptions(args) as [
      string | undefined,
      string | undefined,
      { NX?: boolean; PX?: number; EX?: number } | undefined
    ]
    if (typeof key !== 'string' || typeof value !== 'string') return null
    if (options?.NX && cacheStorage.has(key)) return null
    cacheStorage.set(key, value)
    cacheKeysWritten.push(key)
    return 'OK'
  },
  async keys(pattern: string) {
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1)
      return Array.from(cacheStorage.keys()).filter((key) => key.startsWith(prefix))
    }
    return Array.from(cacheStorage.keys()).filter((key) => key === pattern)
  },
  async del(...args: unknown[]) {
    const keys = flattenValkeyKeys(args).filter((key): key is string => typeof key === 'string')
    let removed = 0
    keys.forEach((key) => {
      if (cacheStorage.delete(key)) removed += 1
    })
    return removed
  },
  async incr(...args: unknown[]) {
    const [key] = stripValkeyCommandOptions(args)
    if (typeof key !== 'string') return 0
    const now = Date.now()
    const record = valkeyCounters.get(key) ?? { count: 0, expiry: now + 60_000 }
    record.count += 1
    valkeyCounters.set(key, record)
    return record.count
  },
  async expire(...args: unknown[]) {
    const [key, seconds] = stripValkeyCommandOptions(args)
    if (typeof key !== 'string' || typeof seconds !== 'number') return 0
    const now = Date.now()
    const record = valkeyCounters.get(key) ?? { count: 0, expiry: now + seconds * 1000 }
    record.expiry = now + seconds * 1000
    valkeyCounters.set(key, record)
    return 1
  },
  async hIncrBy(...args: unknown[]) {
    const [key, field, increment] = stripValkeyCommandOptions(args)
    if (typeof key !== 'string' || typeof field !== 'string' || typeof increment !== 'number') return 0
    const record = valkeyHashes.get(key) ?? {}
    record[field] = (record[field] ?? 0) + increment
    valkeyHashes.set(key, record)
    return record[field]
  },
  async exists(...args: unknown[]) {
    const [key] = stripValkeyCommandOptions(args)
    if (typeof key !== 'string') return 0
    return cacheStorage.has(key) ? 1 : 0
  },
  async eval(_script: string, options: { keys: string[]; arguments: string[] }) {
    const targetKey = options.keys[0]
    const token = options.arguments[0]
    if (typeof targetKey !== 'string' || typeof token !== 'string') {
      return 0
    }
    if (cacheStorage.get(targetKey) === token) {
      cacheStorage.delete(targetKey)
      return 1
    }
    return 0
  },
  async publish(_channel: string, message: string) {
    publishedMessages.push(message)
    for (const handler of subscribers) {
      handler(message)
    }
    return 1
  },
  multi() {
    const commands: Array<() => [null, number]> = []
    let mgetKeys: string[] | null = null
    const api = {
      incr(key: string) {
        const now = Date.now()
        const record = valkeyCounters.get(key) ?? { count: 0, expiry: now + 60_000 }
        record.count += 1
        valkeyCounters.set(key, record)
        commands.push(() => [null, record.count])
        return api
      },
      pTTL(key: string) {
        const record = valkeyCounters.get(key)
        const ttl = record ? Math.max(0, record.expiry - Date.now()) : -1
        commands.push(() => [null, ttl])
        return api
      },
      mGet(keys: string[]) {
        mgetKeys = keys
        return api
      },
      async exec() {
        return commands.map((command) => command())
      },
      async execAsPipeline() {
        if (!mgetKeys) return []
        return [mgetKeys.map((key) => cacheStorage.get(key) ?? null)]
      }
    }
    return api
  },
  async pExpire(key: string, windowMs: number) {
    const now = Date.now()
    const record = valkeyCounters.get(key) ?? { count: 0, expiry: now + windowMs }
    record.expiry = now + windowMs
    valkeyCounters.set(key, record)
  },
  async ping() {
    return 'PONG'
  },
  duplicate() {
    return createValkeyDuplicate()
  },
  async connect() {},
  async quit() {}
}

const cacheClient = {
  client: valkey,
  isReady: () => valkeyReady,
  connect: async () => {
    valkeyReady = true
  },
  disconnect: async () => {
    valkeyReady = false
  }
}

const databaseClient = {
  db: fakeDb,
  pgClient,
  connect: async () => {},
  disconnect: async () => {}
}

const rateLimiter = createRateLimiter()

export const setValkeyReady = (ready: boolean) => {
  valkeyReady = ready
}

export const testValkey = valkey

export const apiPort = 4110
export const apiUrl = `http://127.0.0.1:${apiPort}`

let startPromise: Promise<void> | null = null

export const resetTestState = () => {
  storeItemsData.splice(0, storeItemsData.length, ...structuredClone(defaultStoreItems))
  chatMessagesData.splice(0, chatMessagesData.length, ...structuredClone(defaultChatMessages))
  authUsersData.splice(0, authUsersData.length, { id: 'user-1', email: 'existing@example.com', name: 'Existing User' })
  authSessionsData.splice(0, authSessionsData.length)
  nextChatId = chatMessagesData.length + 1
  nextSessionId = 1
  cacheStorage.clear()
  valkeyCounters.clear()
  valkeyHashes.clear()
  valkeyReady = true
  cacheKeysWritten.splice(0, cacheKeysWritten.length)
  publishedMessages.splice(0, publishedMessages.length)
  subscribers.splice(0, subscribers.length)
}

export const ensureApiReady = async () => {
  if (startPromise === null) {
    process.env.API_PORT = String(apiPort)
    process.env.API_HOST = '127.0.0.1'
    ;(globalThis as typeof globalThis & { __PROM_API_TEST__?: unknown }).__PROM_API_TEST__ = {
      cache: cacheClient,
      database: databaseClient,
      rateLimiter
    }
    startPromise = import('../src/entrypoints/api.ts').then(() => new Promise((resolve) => setTimeout(resolve, 50)))
  }
  await startPromise
}
