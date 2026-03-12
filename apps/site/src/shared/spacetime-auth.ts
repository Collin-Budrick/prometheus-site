import { appConfig } from '../public-app-config'
import { attemptBootstrapSession, clearBootstrapSession } from './auth-bootstrap'
import { clearClientAuthSessionCache } from './auth-session-client'
import { buildPublicApiUrl } from './public-api-url'

export type SpacetimeAuthMethod = 'magic-link' | 'google' | 'github'

type SpacetimeAuthDiscovery = {
  authorization_endpoint: string
  end_session_endpoint?: string
  issuer: string
  token_endpoint: string
}

type PendingAuthRequest = {
  codeVerifier: string
  createdAt: number
  method: SpacetimeAuthMethod
  next: string
  nonce: string
  state: string
}

type TokenResponse = {
  access_token?: string
  expires_in?: number
  id_token?: string
  refresh_token?: string
  scope?: string
  token_type?: string
}

type AuthClaims = {
  aud?: string | string[]
  email?: string
  exp?: number
  iss?: string
  login_method?: string
  name?: string
  nonce?: string
  picture?: string
  preferred_username?: string
  provider_id?: string
  roles?: string[]
  sub?: string
}

export type StoredSpacetimeAuthSession = {
  accessToken?: string
  expiresAt?: number
  idToken: string
  refreshToken?: string
  scope?: string
  tokenType?: string
  user: {
    email?: string
    id: string
    image?: string
    loginMethod?: string
    name?: string
    providerId?: string
    roles?: string[]
  }
}

type StartLoginOptions = {
  next?: string
}

type SpacetimeAuthConfig = {
  authority: string
  clientId: string
  postLogoutRedirectUri: string
  redirectUri: string
}

const pendingRequestStorageKey = 'spacetimeauth:pkce:v1'
const sessionStorageKey = 'spacetimeauth:session:v1'
const refreshGraceMs = 30_000

let discoveryPromise: Promise<SpacetimeAuthDiscovery> | null = null

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

const normalizeRoles = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeOptionalString(entry))
      .filter((entry): entry is string => Boolean(entry))
  }
  const single = normalizeOptionalString(value)
  return single ? [single] : []
}

const readStorage = (storage: Storage, key: string) => {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

const writeStorage = (storage: Storage, key: string, value: string) => {
  try {
    storage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

const removeStorage = (storage: Storage, key: string) => {
  try {
    storage.removeItem(key)
    return true
  } catch {
    return false
  }
}

const parseJson = <T>(value: string | null) => {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

const base64UrlEncode = (bytes: Uint8Array) => {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const randomToken = (size = 32) => {
  const bytes = new Uint8Array(size)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

const createCodeChallenge = async (codeVerifier: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))
  return base64UrlEncode(new Uint8Array(digest))
}

const decodeJwtClaims = (token: string): AuthClaims | null => {
  const parts = token.split('.')
  if (parts.length < 2) return null
  const payload = parts[1]
  if (!payload) return null
  try {
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=')
    const decoded = atob(padded)
    return JSON.parse(decoded) as AuthClaims
  } catch {
    return null
  }
}

const buildConfig = (origin: string): SpacetimeAuthConfig | null => {
  const authority = normalizeOptionalString(appConfig.spacetimeAuthAuthority)
  const clientId = normalizeOptionalString(appConfig.spacetimeAuthClientId)
  if (!authority || !clientId) return null

  return {
    authority: authority.replace(/\/+$/, ''),
    clientId,
    redirectUri: `${origin}/login/callback`,
    postLogoutRedirectUri:
      normalizeOptionalString(appConfig.spacetimeAuthPostLogoutRedirectUri) ?? `${origin}/`
  }
}

const resolveDiscovery = async (origin: string) => {
  const config = buildConfig(origin)
  if (!config) {
    throw new Error('SpacetimeAuth is not configured for this site.')
  }
  if (!discoveryPromise) {
    const discoveryUrl = `${config.authority}/.well-known/openid-configuration`
    discoveryPromise = fetch(discoveryUrl, {
      headers: {
        accept: 'application/json'
      }
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Unable to load SpacetimeAuth discovery (${response.status}).`)
      }
      return (await response.json()) as SpacetimeAuthDiscovery
    })
  }
  return {
    config,
    discovery: await discoveryPromise
  }
}

const normalizeNextPath = (value: string | undefined, origin: string) => {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return '/profile'
  try {
    const nextUrl = new URL(trimmed, origin)
    if (nextUrl.origin !== origin) return '/profile'
    return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}` || '/profile'
  } catch {
    return '/profile'
  }
}

const readPendingRequest = () => {
  if (typeof window === 'undefined') return null
  const pending = parseJson<PendingAuthRequest>(readStorage(window.sessionStorage, pendingRequestStorageKey))
  if (!pending) return null
  if (!pending.state || !pending.nonce || !pending.codeVerifier) return null
  return pending
}

const storePendingRequest = (value: PendingAuthRequest) => {
  if (typeof window === 'undefined') return false
  return writeStorage(window.sessionStorage, pendingRequestStorageKey, JSON.stringify(value))
}

const clearPendingRequest = () => {
  if (typeof window === 'undefined') return false
  return removeStorage(window.sessionStorage, pendingRequestStorageKey)
}

const readStoredSession = () => {
  if (typeof window === 'undefined') return null
  return parseJson<StoredSpacetimeAuthSession>(readStorage(window.localStorage, sessionStorageKey))
}

const writeStoredSession = (value: StoredSpacetimeAuthSession) => {
  if (typeof window === 'undefined') return false
  return writeStorage(window.localStorage, sessionStorageKey, JSON.stringify(value))
}

export const clearStoredSpacetimeAuthSession = () => {
  if (typeof window === 'undefined') return false
  return removeStorage(window.localStorage, sessionStorageKey)
}

const buildStoredSession = (tokens: TokenResponse, claims: AuthClaims): StoredSpacetimeAuthSession => {
  const expiresAt =
    typeof tokens.expires_in === 'number'
      ? Date.now() + tokens.expires_in * 1000
      : typeof claims.exp === 'number'
        ? claims.exp * 1000
        : undefined

  return {
    idToken: tokens.id_token!,
    accessToken: normalizeOptionalString(tokens.access_token),
    refreshToken: normalizeOptionalString(tokens.refresh_token),
    expiresAt,
    scope: normalizeOptionalString(tokens.scope),
    tokenType: normalizeOptionalString(tokens.token_type),
    user: {
      id: claims.sub!,
      email: normalizeOptionalString(claims.email),
      image: normalizeOptionalString(claims.picture),
      loginMethod: normalizeOptionalString(claims.login_method),
      name:
        normalizeOptionalString(claims.name) ??
        normalizeOptionalString(claims.preferred_username) ??
        normalizeOptionalString(claims.email) ??
        claims.sub!,
      providerId: normalizeOptionalString(claims.provider_id),
      roles: normalizeRoles(claims.roles)
    }
  }
}

const isSessionFresh = (session: StoredSpacetimeAuthSession | null) => {
  if (!session) return false
  if (typeof session.expiresAt !== 'number') return true
  return session.expiresAt - refreshGraceMs > Date.now()
}

const validateIdTokenClaims = (
  claims: AuthClaims | null,
  pending: PendingAuthRequest,
  discovery: SpacetimeAuthDiscovery,
  clientId: string
) => {
  if (!claims?.sub) {
    throw new Error('The ID token is missing a subject.')
  }
  if (!claims.iss || claims.iss !== discovery.issuer) {
    throw new Error('The ID token issuer did not match the configured authority.')
  }
  const audiences = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : []
  if (!audiences.includes(clientId)) {
    throw new Error('The ID token audience did not match this client.')
  }
  if (claims.nonce && claims.nonce !== pending.nonce) {
    throw new Error('The login session nonce did not match the callback.')
  }
  if (typeof claims.exp === 'number' && claims.exp * 1000 <= Date.now()) {
    throw new Error('The ID token has already expired.')
  }
}

const exchangeToken = async (origin: string, params: Record<string, string>) => {
  const { config, discovery } = await resolveDiscovery(origin)
  const response = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      ...params
    })
  })

  if (!response.ok) {
    const payload = parseJson<{ error?: string; error_description?: string }>(await response.text())
    throw new Error(
      payload?.error_description ??
        payload?.error ??
        `Unable to complete the SpacetimeAuth token exchange (${response.status}).`
    )
  }

  return {
    config,
    discovery,
    tokens: (await response.json()) as TokenResponse
  }
}

const syncServerSession = async (origin: string, idToken: string, apiBase = appConfig.apiBase) => {
  const response = await fetch(buildPublicApiUrl('/auth/session/sync', origin, apiBase), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({ idToken })
  })

  if (!response.ok) {
    const payload = parseJson<{ error?: string }>(await response.text())
    throw new Error(payload?.error ?? 'Unable to synchronize the site session.')
  }

  clearClientAuthSessionCache()
  return response
}

const withProviderHints = (method: SpacetimeAuthMethod, url: URL) => {
  // If the provider ignores these hints, the hosted auth page still falls back to
  // its own picker without breaking the OIDC flow.
  if (method === 'magic-link') {
    url.searchParams.set('login_method', 'magic_link')
    return
  }

  url.searchParams.set('provider_id', method)
}

export const startSpacetimeAuthLogin = async (
  method: SpacetimeAuthMethod,
  options: StartLoginOptions = {}
) => {
  if (typeof window === 'undefined') return
  const origin = window.location.origin
  const { config, discovery } = await resolveDiscovery(origin)
  const pending: PendingAuthRequest = {
    codeVerifier: randomToken(48),
    createdAt: Date.now(),
    method,
    next: normalizeNextPath(options.next, origin),
    nonce: randomToken(24),
    state: randomToken(24)
  }

  if (!storePendingRequest(pending)) {
    throw new Error('Unable to initialize the login session.')
  }

  const codeChallenge = await createCodeChallenge(pending.codeVerifier)
  const authorizeUrl = new URL(discovery.authorization_endpoint)
  authorizeUrl.searchParams.set('client_id', config.clientId)
  authorizeUrl.searchParams.set('redirect_uri', config.redirectUri)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('scope', 'openid profile email offline_access')
  authorizeUrl.searchParams.set('code_challenge', codeChallenge)
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')
  authorizeUrl.searchParams.set('state', pending.state)
  authorizeUrl.searchParams.set('nonce', pending.nonce)
  withProviderHints(method, authorizeUrl)
  window.location.assign(authorizeUrl.toString())
}

export const completeSpacetimeAuthCallback = async (callbackUrl: string, apiBase = appConfig.apiBase) => {
  if (typeof window === 'undefined') {
    throw new Error('The SpacetimeAuth callback can only complete in the browser.')
  }

  const origin = window.location.origin
  try {
    const currentConfig = buildConfig(origin)
    if (!currentConfig) {
      throw new Error('SpacetimeAuth is not configured for this site.')
    }
    const url = new URL(callbackUrl, origin)
    const pending = readPendingRequest()
    const callbackState = normalizeOptionalString(url.searchParams.get('state'))
    const code = normalizeOptionalString(url.searchParams.get('code'))
    const authError = normalizeOptionalString(url.searchParams.get('error'))
    const authErrorDescription = normalizeOptionalString(url.searchParams.get('error_description'))

    if (authError) {
      throw new Error(authErrorDescription ?? authError)
    }

    if (!pending || !callbackState || pending.state !== callbackState || !code) {
      throw new Error('The login callback is missing its PKCE state.')
    }

    const { config, discovery, tokens } = await exchangeToken(origin, {
      code,
      code_verifier: pending.codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: currentConfig.redirectUri
    })

    if (!tokens.id_token) {
      throw new Error('The token response did not include an ID token.')
    }

    const claims = decodeJwtClaims(tokens.id_token)
    validateIdTokenClaims(claims, pending, discovery, config.clientId)
    const session = buildStoredSession(tokens, claims ?? {})

    if (!writeStoredSession(session)) {
      throw new Error('Unable to persist the browser auth session.')
    }

    await syncServerSession(origin, session.idToken, apiBase)
    await attemptBootstrapSession(origin, apiBase)
    clearPendingRequest()

    return {
      next: normalizeNextPath(pending.next, origin),
      session
    }
  } catch (error) {
    clearPendingRequest()
    throw error
  }
}

export const refreshSpacetimeAuthSession = async (apiBase = appConfig.apiBase) => {
  if (typeof window === 'undefined') return null
  const origin = window.location.origin
  const stored = readStoredSession()
  const refreshToken = normalizeOptionalString(stored?.refreshToken)
  if (!refreshToken) return null

  const { config, discovery, tokens } = await exchangeToken(origin, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  })

  const idToken = normalizeOptionalString(tokens.id_token) ?? stored?.idToken
  if (!idToken) {
    throw new Error('The refresh response did not include an ID token.')
  }

  const claims = decodeJwtClaims(idToken)
  if (!claims?.sub) {
    throw new Error('The refreshed ID token is missing a subject.')
  }
  const providerId = normalizeOptionalString(claims.provider_id)
  const refreshedMethod: SpacetimeAuthMethod =
    providerId === 'github' || providerId === 'google' ? providerId : 'magic-link'
  validateIdTokenClaims(
    claims,
    {
      codeVerifier: '',
      createdAt: Date.now(),
      method: refreshedMethod,
      next: '/profile',
      nonce: normalizeOptionalString(claims.nonce) ?? '',
      state: 'refresh'
    },
    discovery,
    config.clientId
  )

  const session = buildStoredSession(
    {
      ...tokens,
      id_token: idToken,
      refresh_token: tokens.refresh_token ?? refreshToken,
      access_token: tokens.access_token ?? stored?.accessToken,
      scope: tokens.scope ?? stored?.scope,
      token_type: tokens.token_type ?? stored?.tokenType
    },
    claims
  )

  if (!writeStoredSession(session)) {
    throw new Error('Unable to update the browser auth session.')
  }

  await syncServerSession(origin, session.idToken, apiBase)
  await attemptBootstrapSession(origin, apiBase)
  return session
}

export const loadStoredSpacetimeAuthSession = async (apiBase = appConfig.apiBase) => {
  if (typeof window === 'undefined') return null
  const stored = readStoredSession()
  if (isSessionFresh(stored)) {
    return stored
  }
  try {
    return await refreshSpacetimeAuthSession(apiBase)
  } catch {
    clearStoredSpacetimeAuthSession()
    return null
  }
}

export const ensureSpacetimeAuthSession = async (apiBase = appConfig.apiBase) => {
  if (typeof window === 'undefined') return null
  const origin = window.location.origin
  const session = await loadStoredSpacetimeAuthSession(apiBase)
  if (!session) return null
  await syncServerSession(origin, session.idToken, apiBase)
  await attemptBootstrapSession(origin, apiBase)
  return session
}

export const getSpacetimeDbAuthToken = async (apiBase = appConfig.apiBase) => {
  const session = await loadStoredSpacetimeAuthSession(apiBase)
  return session?.idToken ?? null
}

const resolveDirectSpacetimeDbUri = (origin: string) => {
  if (!origin) return appConfig.spacetimeDbUri
  try {
    const url = new URL(origin)
    const hostname = url.hostname
    const isIpAddress = /^[\d.:]+$/.test(hostname)
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
    if (!isIpAddress && !isLocalHost) {
      if (!hostname.startsWith('db.')) {
        url.hostname = `db.${hostname}`
      }
      url.pathname = '/'
      url.search = ''
      url.hash = ''
      return url.toString()
    }
  } catch {
    // Fall through to the legacy same-origin path below.
  }

  return new URL('/spacetimedb', origin).toString()
}

export const resolveSpacetimeDbClientConfig = async (apiBase = appConfig.apiBase) => {
  const token = await getSpacetimeDbAuthToken(apiBase)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const fallbackUri = origin ? resolveDirectSpacetimeDbUri(origin) : appConfig.spacetimeDbUri
  return {
    module: appConfig.spacetimeDbModule || 'prometheus-site',
    token,
    uri: appConfig.spacetimeDbUri || fallbackUri
  }
}

export const signOutSpacetimeAuth = async (apiBase = appConfig.apiBase) => {
  if (typeof window === 'undefined') return '/'
  const origin = window.location.origin
  const storedSession = readStoredSession()

  try {
    await fetch(buildPublicApiUrl('/auth/logout', origin, apiBase), {
      method: 'POST',
      credentials: 'include'
    })
  } catch {
    // Clearing local state still leaves the app signed out even if the bridge fails.
  }

  clearPendingRequest()
  clearStoredSpacetimeAuthSession()
  clearClientAuthSessionCache()
  await clearBootstrapSession()

  try {
    const { config, discovery } = await resolveDiscovery(origin)
    if (!discovery.end_session_endpoint) {
      return config.postLogoutRedirectUri
    }

    const logoutUrl = new URL(discovery.end_session_endpoint)
    logoutUrl.searchParams.set('post_logout_redirect_uri', config.postLogoutRedirectUri)
    if (storedSession?.idToken) {
      logoutUrl.searchParams.set('id_token_hint', storedSession.idToken)
    }
    return logoutUrl.toString()
  } catch {
    return appConfig.spacetimeAuthPostLogoutRedirectUri ?? `${origin}/`
  }
}

export const isSpacetimeAuthConfigured = () =>
  Boolean(normalizeOptionalString(appConfig.spacetimeAuthAuthority)) &&
  Boolean(normalizeOptionalString(appConfig.spacetimeAuthClientId))
