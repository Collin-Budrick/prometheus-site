import { mock } from 'bun:test'
import { Elysia } from 'elysia'
import { storeItems, chatMessages } from '@platform/db/schema'
import { createRateLimiter } from '@platform/rate-limit'

type AuthSession = { id: string; userId: string }
type PasskeyEvent = { type: 'registration' | 'authentication'; payload: unknown }

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
export const passkeyEvents: PasskeyEvent[] = []
export const oauthStarts: Array<{ provider: string; redirect: string }> = []
export const oauthCallbacks: Array<{ provider: string; code: string | null; state: string | null }> = []

let nextChatId = chatMessagesData.length + 1
let nextUserId = authUsersData.length + 1
let nextSessionId = 1
let registerChallenge = 'register-challenge'
let authenticationChallenge = 'authenticate-challenge'

const cacheStorage = new Map<string, string>()
const valkeyCounters = new Map<string, { count: number; expiry: number }>()
const valkeyHashes = new Map<string, Record<string, number>>()
export const cacheKeysWritten: string[] = []
export const publishedMessages: string[] = []
const subscribers: ((message: string) => void)[] = []

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

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

const findUserByEmail = (email: string) => authUsersData.find((user) => user.email === email)

const signInWithEmail = async (body: { email: string; password: string }, _context?: { request?: Request }) => {
  const user = findUserByEmail(body.email)
  if (user === undefined) {
    return authJson({ message: 'Invalid credentials' }, { status: 401 })
  }

  const session = createSession(user.id)
  return authJson(
    {
      user,
      session: { token: session.id, userId: user.id, expiresAt: new Date(Date.now() + 3600_000).toISOString() }
    },
    { headers: { 'set-cookie': session.cookie } }
  )
}

const signUpWithEmail = async (
  body: { name: string; email: string; password: string },
  _context?: { request?: Request }
) => {
  const existingUser = findUserByEmail(body.email)
  if (existingUser !== undefined) {
    return authJson({ message: 'User already exists' }, { status: 409 })
  }

  const user = { id: `user-${nextUserId}`, email: body.email, name: body.name }
  nextUserId += 1
  authUsersData.push(user)
  const session = createSession(user.id)

  return authJson(
    {
      user,
      session: { token: session.id, userId: user.id, expiresAt: new Date(Date.now() + 3600_000).toISOString() }
    },
    { headers: { 'set-cookie': session.cookie } }
  )
}

const signUpWithPasskey = async (
  body: { name: string; email: string },
  context?: { request?: Request }
) => signUpWithEmail({ ...body, password: `passkey-${Date.now()}` }, context)

const validateSession = async (context?: { request?: Request; headers?: HeadersInit }) => {
  const sessionId = getSessionIdFromHeaders(context?.headers ?? context?.request?.headers)
  if (sessionId === null) return authJson({ message: 'No active session' }, { status: 401 })

  const session = authSessionsData.find((record) => record.id === sessionId)
  if (session === undefined) return authJson({ message: 'No active session' }, { status: 401 })

  const user = authUsersData.find((candidate) => candidate.id === session.userId)
  if (user === undefined) return authJson({ message: 'No active session' }, { status: 401 })

  return authJson(
    {
      user,
      session: { token: session.id, userId: user.id, expiresAt: new Date(Date.now() + 3600_000).toISOString() }
    },
    { headers: { 'set-cookie': `session=${session.id}; Path=/; HttpOnly; SameSite=Lax` } }
  )
}

const handleAuthRequest = async (request: Request) => {
  const url = new URL(request.url)
  const { pathname } = url

  if (pathname.endsWith('/passkey/generate-register-options')) {
    return authJson({
      challenge: registerChallenge,
      user: { id: authUsersData[0]?.id ?? 'user-1', name: authUsersData[0]?.name ?? 'Passkey User' },
      rpId: 'localhost'
    })
  }

  if (pathname.endsWith('/passkey/verify-registration')) {
    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      payload = null
    }
    passkeyEvents.push({ type: 'registration', payload })
    const session = createSession(authUsersData[0]?.id ?? 'user-1')
    return authJson({ verified: true }, { headers: { 'set-cookie': session.cookie } })
  }

  if (pathname.endsWith('/passkey/generate-authenticate-options')) {
    return authJson({
      challenge: authenticationChallenge,
      allowCredentials: [{ id: 'cred-123', type: 'public-key' }]
    })
  }

  if (pathname.endsWith('/passkey/verify-authentication')) {
    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      payload = null
    }
    passkeyEvents.push({ type: 'authentication', payload })
    const session = createSession(authUsersData[0]?.id ?? 'user-1')
    return authJson({ authenticated: true }, { headers: { 'set-cookie': session.cookie } })
  }

  const oauthStart = pathname.match(/\/auth\/oauth\/(.+?)\/start/)
  if (oauthStart !== null) {
    const provider = oauthStart[1]
    const redirect = `/auth/oauth/${provider}/callback?code=mock-code&state=mock-state`
    oauthStarts.push({ provider, redirect })
    return new Response(null, {
      status: 302,
      headers: { location: redirect }
    })
  }

  const oauthCallback = pathname.match(/\/auth\/oauth\/(.+?)\/callback/)
  if (oauthCallback !== null) {
    const provider = oauthCallback[1]
    oauthCallbacks.push({ provider, code: url.searchParams.get('code'), state: url.searchParams.get('state') })
    const session = createSession(authUsersData[0]?.id ?? 'user-1')
    return new Response(null, {
      status: 302,
      headers: { location: '/', 'set-cookie': session.cookie }
    })
  }

  return authJson({ message: 'Unhandled auth route' }, { status: 404 })
}

const authRoutes = new Elysia({ prefix: '/auth' })
  .post('/sign-in/email', async ({ body, request }) => signInWithEmail(body as any, { request }))
  .post('/sign-up/email', async ({ body, request }) => signUpWithEmail(body as any, { request }))
  .post('/sign-up/passkey', async ({ body, request }) => signUpWithPasskey(body as any, { request }))
  .get('/session', async ({ request }) => validateSession({ request }))
  .all('/*', async ({ request }) => handleAuthRequest(request))

mock.module('@features/auth/server', () => ({
  createAuthFeature: () => ({
    auth: {},
    authRoutes,
    handleAuthRequest,
    signInWithEmail,
    signUpWithEmail,
    signUpWithPasskey,
    validateSession
  })
}))

let valkeyReady = true

const valkey = {
  isOpen: true,
  async get(key: string) {
    return cacheStorage.get(key) ?? null
  },
  async set(
    key: string,
    value: string,
    options?: { NX?: boolean; PX?: number; EX?: number }
  ) {
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
  async del(...keys: string[]) {
    let removed = 0
    keys.forEach((key) => {
      if (cacheStorage.delete(key)) removed += 1
    })
    return removed
  },
  async incr(key: string) {
    const now = Date.now()
    const record = valkeyCounters.get(key) ?? { count: 0, expiry: now + 60_000 }
    record.count += 1
    valkeyCounters.set(key, record)
    return record.count
  },
  async expire(key: string, seconds: number) {
    const now = Date.now()
    const record = valkeyCounters.get(key) ?? { count: 0, expiry: now + seconds * 1000 }
    record.expiry = now + seconds * 1000
    valkeyCounters.set(key, record)
    return 1
  },
  async hIncrBy(key: string, field: string, increment: number) {
    const record = valkeyHashes.get(key) ?? {}
    record[field] = (record[field] ?? 0) + increment
    valkeyHashes.set(key, record)
    return record[field]
  },
  async exists(key: string) {
    return cacheStorage.has(key) ? 1 : 0
  },
  async eval(_script: string, options: { keys: string[]; arguments: string[] }) {
    const targetKey = options.keys[0]
    const token = options.arguments[0]
    if (targetKey && token && cacheStorage.get(targetKey) === token) {
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
    return {
      async connect() {},
      async subscribe(_channel: string, handler: (message: string) => void) {
        subscribers.push(handler)
      },
      async quit() {}
    }
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
  passkeyEvents.splice(0, passkeyEvents.length)
  oauthStarts.splice(0, oauthStarts.length)
  oauthCallbacks.splice(0, oauthCallbacks.length)
  nextChatId = chatMessagesData.length + 1
  nextUserId = authUsersData.length + 1
  nextSessionId = 1
  registerChallenge = 'register-challenge'
  authenticationChallenge = 'authenticate-challenge'
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
    process.env.RUN_MIGRATIONS = '0'
    ;(globalThis as typeof globalThis & { __PROM_API_TEST__?: unknown }).__PROM_API_TEST__ = {
      cache: cacheClient,
      database: databaseClient,
      rateLimiter
    }
    startPromise = import('../src/entrypoints/api.ts').then(() => new Promise((resolve) => setTimeout(resolve, 50)))
  }
  await startPromise
}
