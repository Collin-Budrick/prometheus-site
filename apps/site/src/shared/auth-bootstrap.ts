import { appConfig } from '../app-config'

type JsonObject = Record<string, string | number | boolean | null>

type BootstrapUser = {
  id: string
  email?: string
  name?: string | null
}

export type BootstrapSession = {
  token: string
  user: BootstrapUser
  issuedAt?: number
  expiresAt?: number
}

const tokenKey = 'auth:bootstrap:token'
const userKey = 'auth:bootstrap:user'

const decodeBase64Url = (value: string) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

const parseJson = <T>(value: string): T | null => {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

const parseRecord = <T>(value: unknown): value is T => {
  if (typeof value !== 'object' || value === null) return false
  return true
}

const loadPublicKey = (() => {
  let cached: Promise<CryptoKey | null> | null = null

  return () => {
    if (cached) return cached
    cached = (async () => {
      const raw = appConfig.authBootstrapPublicKey?.trim() ?? ''
      if (!raw || typeof crypto === 'undefined' || !crypto.subtle) return null
      const parsed = parseJson<JsonObject>(raw)
      if (!parsed || !parseRecord<JsonWebKey>(parsed)) return null
      try {
        return await crypto.subtle.importKey(
          'jwk',
          parsed,
          { name: 'ECDSA', namedCurve: 'P-256' },
          true,
          ['verify']
        )
      } catch {
        return null
      }
    })()
    return cached
  }
})()

const verifyToken = async (token: string) => {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [headerB64, payloadB64, signatureB64] = parts
  if (!headerB64 || !payloadB64 || !signatureB64) return null

  const headerText = new TextDecoder().decode(decodeBase64Url(headerB64))
  const payloadText = new TextDecoder().decode(decodeBase64Url(payloadB64))
  const header = parseJson<{ alg?: string }>(headerText)
  const payload = parseJson<{
    sub?: string
    email?: string
    name?: string | null
    iat?: number
    exp?: number
  }>(payloadText)

  if (!header || header.alg !== 'ES256' || !payload?.sub) return null

  const key = await loadPublicKey()
  if (!key) return null

  const signature = decodeBase64Url(signatureB64)
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  const isValid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    signature,
    data
  )
  if (!isValid) return null

  const now = Math.floor(Date.now() / 1000)
  if (typeof payload.exp === 'number' && now > payload.exp) return null

  return payload
}

const readWebStorage = (key: string) => {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const writeWebStorage = (key: string, value: string) => {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

const removeWebStorage = (key: string) => {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

const readBootstrapPayload = async () => {
  const [token, userRaw] = await Promise.all([
    Promise.resolve(readWebStorage(tokenKey)),
    Promise.resolve(readWebStorage(userKey))
  ])
  return {
    token,
    userRaw
  }
}

const writeBootstrapPayload = async (session: BootstrapSession) => {
  const writeUser = {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name
  }
  const [tokenSaved, userSaved] = await Promise.all([
    Promise.resolve(writeWebStorage(tokenKey, session.token)),
    Promise.resolve(writeWebStorage(userKey, JSON.stringify(writeUser)))
  ])
  if (!tokenSaved || !userSaved) throw new Error('Unable to persist bootstrap session')
}

const parseBootstrapSession = (token: string, userRaw: string | null) => {
  return verifyToken(token).then((payload) => {
    if (!payload?.sub) return null
    const storedUser = parseJson<BootstrapUser>(userRaw ?? '')
    const user: BootstrapUser = {
      id: payload.sub,
      email: payload.email ?? storedUser?.email,
      name: payload.name ?? storedUser?.name ?? undefined
    }
    return {
      token,
      user,
      issuedAt: payload.iat,
      expiresAt: payload.exp
    }
  })
}

const resolveAuthBase = (origin: string, apiBase?: string) => {
  const isLocalHost = (hostname: string) => hostname === '127.0.0.1' || hostname === 'localhost'
  if (!apiBase) return ''
  if (apiBase.startsWith('/')) return apiBase
  try {
    const apiUrl = new URL(apiBase)
    const originUrl = new URL(origin)
    const apiHost = apiUrl.hostname
    const originHost = originUrl.hostname
    if (isLocalHost(apiHost) && !isLocalHost(originHost) && apiHost !== originHost) {
      return '/api'
    }
    return apiBase
  } catch {
    return ''
  }
}

export const buildApiUrl = (path: string, origin: string, apiBase?: string) => {
  const base = resolveAuthBase(origin, apiBase)
  if (!base) return `${origin}${path}`

  if (base.startsWith('/')) {
    if (path.startsWith(base)) return `${origin}${path}`
    return `${origin}${base}${path}`
  }

  if (path.startsWith('/api')) {
    const normalizedBase = base.endsWith('/api') ? base.slice(0, -4) : base
    return `${normalizedBase}${path}`
  }

  return `${base}${path}`
}

export const storeBootstrapSession = async (session: BootstrapSession): Promise<boolean> => {
  if (typeof window === 'undefined') return false
  try {
    await writeBootstrapPayload(session)
    return true
  } catch {
    return false
  }
}

export const clearBootstrapSession = async () => {
  if (typeof window === 'undefined') return
  await Promise.all([
    Promise.resolve(removeWebStorage(tokenKey)),
    Promise.resolve(removeWebStorage(userKey))
  ])
}

export const loadBootstrapSession = async (): Promise<BootstrapSession | null> => {
  if (typeof window === 'undefined') return null
  const payload = await readBootstrapPayload()
  if (!payload.token) return null
  return parseBootstrapSession(payload.token, payload.userRaw)
}

export const attemptBootstrapSession = async (origin: string, apiBase?: string): Promise<boolean> => {
  if (typeof window === 'undefined') return false

  try {
    const response = await fetch(buildApiUrl('/auth/bootstrap', origin, apiBase), {
      method: 'POST',
      credentials: 'include'
    })
    if (!response.ok) return false

    const body = (await response.json()) as unknown
    if (!parseRecord(body) || typeof (body as { token?: string }).token !== 'string') return false

    const payload = (body as { token: string; user?: { id?: string; email?: string | null; name?: string | null } })
    const user = parseRecord(payload.user) ? payload.user : null
    const id = user?.id && typeof user.id === 'string' ? user.id : payload.user?.id

    if (!id) return false

    const storeUser: BootstrapUser = {
      id,
      email: typeof user?.email === 'string' ? user.email : undefined,
      name: typeof user?.name === 'string' || user?.name === null ? user.name : undefined
    }

    const stored = await storeBootstrapSession({ token: payload.token, user: storeUser })
    return stored
  } catch {
    return false
  }
}
