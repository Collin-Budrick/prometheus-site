import { appConfig } from '../app-config'

export type BootstrapUser = {
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

const parseJson = <T>(value: string) => {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

const loadPublicKey = (() => {
  let cached: Promise<CryptoKey | null> | null = null
  return () => {
    if (cached) return cached
    cached = (async () => {
      const raw = appConfig.authBootstrapPublicKey?.trim() ?? ''
      if (!raw || typeof crypto === 'undefined' || !crypto.subtle) return null
      const parsed = parseJson<JsonWebKey>(raw)
      if (!parsed) return null
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
  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    signature,
    data
  )
  if (!ok) return null
  const now = Math.floor(Date.now() / 1000)
  if (typeof payload.exp === 'number' && now > payload.exp) return null
  return payload
}

export const storeBootstrapSession = (session: BootstrapSession) => {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(tokenKey, session.token)
    window.localStorage.setItem(userKey, JSON.stringify(session.user))
    return true
  } catch {
    return false
  }
}

export const clearBootstrapSession = () => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(tokenKey)
    window.localStorage.removeItem(userKey)
  } catch {
    // ignore storage failures
  }
}

export const loadBootstrapSession = async (): Promise<BootstrapSession | null> => {
  if (typeof window === 'undefined') return null
  const token = window.localStorage.getItem(tokenKey)
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload?.sub) return null
  const storedUser = parseJson<BootstrapUser>(window.localStorage.getItem(userKey) ?? '')
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
}
