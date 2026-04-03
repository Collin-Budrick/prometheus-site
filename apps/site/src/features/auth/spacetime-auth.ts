import { templateBranding } from '@prometheus/template-config'
import { appConfig } from '@site/site-config'
import { buildPublicSiteAuthUrl } from '@site/shared/public-api-url'
import { attemptBootstrapSession, clearBootstrapSession } from './auth-bootstrap'
import { clearClientAuthSessionCache } from './auth-session-client'
import { normalizePublicKeyOptions, serializeCredential } from './passkey'

export const hostedSocialProviders = ['google', 'facebook', 'twitter', 'github'] as const
export type HostedSocialProvider = (typeof hostedSocialProviders)[number]
const hostedSocialProviderSet = new Set<string>(hostedSocialProviders)
export type HostedPasskeyAttachment = 'platform' | 'cross-platform'

export const isHostedSocialProvider = (value: unknown): value is HostedSocialProvider =>
  typeof value === 'string' && hostedSocialProviderSet.has(value)

export const getHostedSocialProviderLabel = (provider: HostedSocialProvider) => {
  switch (provider) {
    case 'google':
      return 'Google'
    case 'facebook':
      return 'Facebook'
    case 'twitter':
      return 'Twitter (X)'
    case 'github':
      return 'GitHub'
  }
}

export type SpacetimeAuthMethod = 'magic-link' | HostedSocialProvider

type AuthClaims = {
  aud?: string | string[]
  email?: string
  exp?: number
  iss?: string
  login_method?: string
  name?: string
  picture?: string
  preferred_username?: string
  provider_id?: string
  roles?: string[] | string
  sub?: string
}

export type StoredSpacetimeAuthSession = {
  expiresAt?: number
  idToken: string
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

export type SpacetimeAuthMode = 'hosted' | 'dev-session' | 'disabled'

type AuthRuntimeEnv = Partial<ImportMetaEnv> & {
  DEV?: boolean
  MODE?: string
  NODE_ENV?: string
}

type DevSessionRequestBody = {
  loginMethod: SpacetimeAuthMethod
  providerId?: HostedSocialProvider
}

type DevLocalAccountRequestBody = {
  email: string
  name?: string
  password: string
  remember?: boolean
}

type BetterAuthSessionResponse = {
  session?: {
    id?: string
  }
  user?: {
    email?: string
    id?: string
    image?: string | null
    name?: string
  }
}

type BetterAuthTokenResponse = {
  token?: string
}

type BetterAuthRedirectResponse = {
  redirect?: boolean
  url?: string
}

type BetterAuthPasskeyResponse = {
  response?: Record<string, unknown>
}

type BetterAuthErrorResponse = {
  code?: string
  error?: string
  message?: string
}

type DevSessionResponse = {
  error?: string
}

type HostedAuthResult = {
  next: string
  session: StoredSpacetimeAuthSession
}

type RegisterHostedPasskeyOptions = {
  authenticatorAttachment?: HostedPasskeyAttachment
  name?: string
}

const pendingRequestStorageKey = 'spacetimeauth:pkce:v1'
const sessionStorageKey = 'spacetimeauth:session:v1'
const preferredSpacetimeDbUriStorageKey = 'spacetimedb:preferred-uri:v1'
const preferredSpacetimeDbUriTtlMs = 7 * 24 * 60 * 60 * 1000
const refreshGraceMs = 30_000
const localDevelopmentHostnames = new Set(['localhost', '127.0.0.1', '::1'])

type StoredPreferredSpacetimeDbUri = {
  moduleName: string
  origin: string
  updatedAt: number
  uri: string
}

const authRuntimeEnv =
  typeof import.meta !== 'undefined'
    ? (import.meta as ImportMeta & { env?: AuthRuntimeEnv }).env
    : undefined

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
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

const normalizeApiPath = (value: string | undefined, fallback = '/api/auth') => {
  const trimmed = normalizeOptionalString(value) ?? fallback
  if (trimmed === '/') return '/'
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withLeadingSlash.replace(/\/+$/, '') || '/'
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

const decodeJwtClaims = (token: string): AuthClaims | null => {
  const parts = token.split('.')
  if (parts.length < 2) return null
  const payload = parts[1]
  if (!payload) return null
  try {
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=')
    return JSON.parse(atob(padded)) as AuthClaims
  } catch {
    return null
  }
}

const normalizeAbsoluteUrl = (value: string) => {
  try {
    return new URL(value).toString()
  } catch {
    return value.trim()
  }
}

const isDevelopmentRuntime = () => {
  if (authRuntimeEnv?.DEV === true) return true
  const mode = normalizeOptionalString(authRuntimeEnv?.MODE)?.toLowerCase()
  if (mode === 'development') return true
  return normalizeOptionalString(authRuntimeEnv?.NODE_ENV)?.toLowerCase() === 'development'
}

const isDevelopmentHostname = (hostname?: string) => {
  const normalizedHostname = normalizeOptionalString(hostname)?.toLowerCase()
  if (!normalizedHostname) return false
  return (
    localDevelopmentHostnames.has(normalizedHostname) ||
    normalizedHostname.endsWith('.dev') ||
    normalizedHostname.endsWith('.localhost')
  )
}

const buildAuthBasePath = () => normalizeApiPath(appConfig.authBasePath, '/api/auth')

const buildAuthUrl = (path: string, origin: string) => {
  const basePath = buildAuthBasePath()
  const resolvedPath = path.startsWith('/') ? path : `/${path}`
  return `${origin}${basePath}${resolvedPath}`
}

const isBrowserPasskeyAvailable = () =>
  typeof PublicKeyCredential !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  typeof navigator.credentials?.create === 'function' &&
  typeof navigator.credentials?.get === 'function'

const resolvePasskeyErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return fallback
    if (error.message.trim()) return error.message
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  return fallback
}

export const resolveSpacetimeAuthMode = ({
  authBasePath,
  dev,
  featureEnabled = true,
  hostname
}: {
  authBasePath?: string
  dev?: boolean
  featureEnabled?: boolean
  hostname?: string
}): SpacetimeAuthMode => {
  const normalizedAuthBasePath = normalizeOptionalString(authBasePath)
  if (featureEnabled && normalizedAuthBasePath) {
    return 'hosted'
  }
  return featureEnabled && (dev || isDevelopmentHostname(hostname)) ? 'dev-session' : 'disabled'
}

export const getSpacetimeAuthMode = (): SpacetimeAuthMode =>
  resolveSpacetimeAuthMode({
    authBasePath: appConfig.authBasePath,
    dev: isDevelopmentRuntime(),
    featureEnabled: appConfig.template.features.auth,
    hostname: typeof window !== 'undefined' ? window.location.hostname : undefined
  })

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

const clearPendingRequest = () => {
  if (typeof window === 'undefined') return
  removeStorage(window.sessionStorage, pendingRequestStorageKey)
}

const readStoredSession = () => {
  if (typeof window === 'undefined') return null
  return parseJson<StoredSpacetimeAuthSession>(readStorage(window.sessionStorage, sessionStorageKey))
}

const writeStoredSession = (value: StoredSpacetimeAuthSession) => {
  if (typeof window === 'undefined') return false
  return writeStorage(window.sessionStorage, sessionStorageKey, JSON.stringify(value))
}

export const clearStoredSpacetimeAuthSession = () => {
  if (typeof window === 'undefined') return
  removeStorage(window.sessionStorage, sessionStorageKey)
}

const buildStoredSession = (
  idToken: string,
  claims: AuthClaims,
  fallbackUser?: BetterAuthSessionResponse['user']
): StoredSpacetimeAuthSession => ({
  expiresAt: typeof claims.exp === 'number' ? claims.exp * 1000 : undefined,
  idToken,
  user: {
    email: normalizeOptionalString(claims.email) ?? normalizeOptionalString(fallbackUser?.email),
    id: claims.sub ?? fallbackUser?.id ?? '',
    image: normalizeOptionalString(claims.picture) ?? normalizeOptionalString(fallbackUser?.image ?? undefined),
    loginMethod: normalizeOptionalString(claims.login_method),
    name: normalizeOptionalString(claims.name) ?? normalizeOptionalString(fallbackUser?.name),
    providerId: normalizeOptionalString(claims.provider_id),
    roles: normalizeRoles(claims.roles)
  }
})

const isSessionFresh = (session: StoredSpacetimeAuthSession | null) => {
  if (!session?.idToken) return false
  if (!session.expiresAt) return true
  return session.expiresAt - refreshGraceMs > Date.now()
}

const readResponseJson = async <T>(response: Response) => {
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}

const resolveHostedErrorMessage = async (response: Response, fallback: string) => {
  const payload = await readResponseJson<BetterAuthErrorResponse>(response)
  return payload?.message ?? payload?.error ?? fallback
}

const syncServerSession = async (origin: string, token: string, apiBase = appConfig.apiBase) => {
  const response = await fetch(buildPublicSiteAuthUrl('/auth/session/sync', origin), {
    method: 'POST',
    credentials: 'include',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json'
    },
    body: JSON.stringify({ idToken: token, token })
  })

  if (!response.ok) {
    const payload = parseJson<{ error?: string }>(await response.text())
    throw new Error(payload?.error ?? 'Unable to synchronize the site session.')
  }

  clearClientAuthSessionCache()
}

const shouldAttemptBootstrapRefresh = () =>
  getSpacetimeAuthMode() === 'hosted' && Boolean(normalizeOptionalString(appConfig.authBootstrapPublicKey))

const refreshBrowserAuthState = async (origin: string, apiBase = appConfig.apiBase) => {
  clearPendingRequest()
  clearStoredSpacetimeAuthSession()
  clearClientAuthSessionCache()
  await clearBootstrapSession()
  if (shouldAttemptBootstrapRefresh()) {
    await attemptBootstrapSession(origin, apiBase)
  }
}

const fetchHostedSession = async (origin: string) => {
  const response = await fetch(buildAuthUrl('/get-session', origin), {
    credentials: 'include',
    headers: {
      accept: 'application/json'
    }
  })
  if (response.status === 401) return null
  if (!response.ok) {
    throw new Error(await resolveHostedErrorMessage(response, 'Unable to read the hosted auth session.'))
  }
  return await readResponseJson<BetterAuthSessionResponse | null>(response)
}

const fetchHostedToken = async (origin: string) => {
  const response = await fetch(buildAuthUrl('/token', origin), {
    credentials: 'include',
    headers: {
      accept: 'application/json'
    }
  })
  if (response.status === 401) return null
  if (!response.ok) {
    throw new Error(await resolveHostedErrorMessage(response, 'Unable to mint the hosted auth JWT.'))
  }
  return await readResponseJson<BetterAuthTokenResponse>(response)
}

const buildHostedSessionResult = async (origin: string) => {
  const hostedSession = await fetchHostedSession(origin)
  if (!hostedSession?.session || !hostedSession.user) return null

  const hostedToken = await fetchHostedToken(origin)
  const idToken = normalizeOptionalString(hostedToken?.token)
  if (!idToken) {
    throw new Error('The hosted auth token response did not include a JWT.')
  }

  const claims = decodeJwtClaims(idToken)
  if (!claims?.sub) {
    throw new Error('The hosted auth JWT is missing a subject.')
  }

  return buildStoredSession(idToken, claims, hostedSession.user)
}

const restoreHostedSession = async (origin: string, apiBase = appConfig.apiBase) => {
  const session = await buildHostedSessionResult(origin)
  if (!session) {
    clearStoredSpacetimeAuthSession()
    clearClientAuthSessionCache()
    return null
  }

  if (!writeStoredSession(session)) {
    throw new Error('Unable to store the hosted auth session in the browser.')
  }

  await syncServerSession(origin, session.idToken, apiBase)
  if (shouldAttemptBootstrapRefresh()) {
    await attemptBootstrapSession(origin, apiBase)
  }
  return session
}

const buildDevSessionBody = (method: SpacetimeAuthMethod): DevSessionRequestBody =>
  method === 'magic-link'
    ? { loginMethod: method }
    : { loginMethod: method, providerId: method }

const postDevSessionRequest = async (
  path: string,
  body: DevSessionRequestBody | DevLocalAccountRequestBody,
  fallbackMessage: string,
  apiBase = appConfig.apiBase
) => {
  if (typeof window === 'undefined') return
  const origin = window.location.origin
  const response = await fetch(buildPublicSiteAuthUrl(path, origin), {
    method: 'POST',
    credentials: 'include',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const payload = parseJson<DevSessionResponse>(await response.text())
    throw new Error(payload?.error ?? fallbackMessage)
  }

  await refreshBrowserAuthState(origin, apiBase)
}

const startDevSessionLogin = async (
  method: SpacetimeAuthMethod,
  next: string,
  apiBase = appConfig.apiBase
) => {
  await postDevSessionRequest(
    '/auth/dev/session',
    buildDevSessionBody(method),
    'Unable to create the local development session.',
    apiBase
  )
  window.location.assign(next)
}

export const registerDevLocalAccount = async (
  account: DevLocalAccountRequestBody,
  apiBase = appConfig.apiBase
) => {
  await postDevSessionRequest(
    '/auth/dev/register',
    account,
    'Unable to create the local development account.',
    apiBase
  )
}

export const loginDevLocalAccount = async (
  account: DevLocalAccountRequestBody,
  apiBase = appConfig.apiBase
) => {
  await postDevSessionRequest(
    '/auth/dev/login',
    account,
    'Unable to sign in to the local development account.',
    apiBase
  )
}

const postHostedJson = async <TResponse>(
  origin: string,
  path: string,
  body: Record<string, unknown>,
  fallbackMessage: string
) => {
  const response = await fetch(buildAuthUrl(path, origin), {
    method: 'POST',
    credentials: 'include',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    throw new Error(await resolveHostedErrorMessage(response, fallbackMessage))
  }

  return (await readResponseJson<TResponse>(response)) as TResponse
}

const getHostedJson = async <TResponse>(origin: string, path: string, fallbackMessage: string) => {
  const response = await fetch(buildAuthUrl(path, origin), {
    credentials: 'include',
    headers: {
      accept: 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(await resolveHostedErrorMessage(response, fallbackMessage))
  }

  return (await readResponseJson<TResponse>(response)) as TResponse
}

const requestPasskeyAuthenticationCredential = async (options: unknown) => {
  const credential = await navigator.credentials.get({
    publicKey: normalizePublicKeyOptions<PublicKeyCredentialRequestOptions>(options)
  })

  if (!credential) {
    throw new Error('Passkey sign-in was canceled.')
  }

  return serializeCredential(credential as PublicKeyCredential)
}

const createPasskeyRegistrationCredential = async (options: unknown) => {
  const credential = await navigator.credentials.create({
    publicKey: normalizePublicKeyOptions<PublicKeyCredentialCreationOptions>(options)
  })

  if (!credential) {
    throw new Error('Passkey setup was canceled.')
  }

  return serializeCredential(credential as PublicKeyCredential)
}

export const loginHostedLocalAccount = async (
  account: DevLocalAccountRequestBody,
  apiBase = appConfig.apiBase
) => {
  if (typeof window === 'undefined') return null
  const origin = window.location.origin
  await postHostedJson(
    origin,
    '/sign-in/email',
    {
      email: account.email,
      password: account.password,
      rememberMe: account.remember !== false
    },
    'Unable to sign in with email and password.'
  )
  return await restoreHostedSession(origin, apiBase)
}

export const registerHostedLocalAccount = async (
  account: DevLocalAccountRequestBody,
  apiBase = appConfig.apiBase
) => {
  if (typeof window === 'undefined') return null
  const origin = window.location.origin
  await postHostedJson(
    origin,
    '/sign-up/email',
    {
      name: account.name?.trim() || account.email,
      email: account.email,
      password: account.password,
      rememberMe: account.remember !== false
    },
    'Unable to create the hosted account.'
  )
  return await restoreHostedSession(origin, apiBase)
}

export const isHostedPasskeySupported = () =>
  getSpacetimeAuthMode() === 'hosted' && isBrowserPasskeyAvailable()

export const signInHostedPasskey = async (apiBase = appConfig.apiBase) => {
  if (typeof window === 'undefined') return null
  if (!isHostedPasskeySupported()) {
    throw new Error('Passkeys are not available in this browser.')
  }

  const origin = window.location.origin
  try {
    const options = await getHostedJson<unknown>(
      origin,
      '/passkey/generate-authenticate-options',
      'Unable to start passkey sign-in.'
    )
    const credential = await requestPasskeyAuthenticationCredential(options)
    await postHostedJson<BetterAuthPasskeyResponse>(
      origin,
      '/passkey/verify-authentication',
      { response: credential },
      'Unable to verify the passkey sign-in.'
    )
    return await restoreHostedSession(origin, apiBase)
  } catch (error) {
    throw new Error(resolvePasskeyErrorMessage(error, 'Passkey sign-in was canceled or failed.'))
  }
}

export const registerHostedPasskey = async (
  options: RegisterHostedPasskeyOptions = {},
  apiBase = appConfig.apiBase
) => {
  if (typeof window === 'undefined') return null
  if (!isHostedPasskeySupported()) {
    throw new Error('Passkeys are not available in this browser.')
  }

  const origin = window.location.origin
  const query = new URLSearchParams()
  const name = options.name?.trim()
  if (name) {
    query.set('name', name)
  }
  if (options.authenticatorAttachment) {
    query.set('authenticatorAttachment', options.authenticatorAttachment)
  }

  const generatePath = query.size
    ? `/passkey/generate-register-options?${query.toString()}`
    : '/passkey/generate-register-options'

  try {
    const registrationOptions = await getHostedJson<unknown>(
      origin,
      generatePath,
      'Unable to start passkey setup.'
    )
    const credential = await createPasskeyRegistrationCredential(registrationOptions)
    await postHostedJson<BetterAuthPasskeyResponse>(
      origin,
      '/passkey/verify-registration',
      {
        ...(name ? { name } : {}),
        response: credential
      },
      'Unable to finish passkey setup.'
    )
    return await restoreHostedSession(origin, apiBase)
  } catch (error) {
    throw new Error(resolvePasskeyErrorMessage(error, 'Passkey setup was canceled or failed.'))
  }
}

export const startSpacetimeAuthLogin = async (
  method: SpacetimeAuthMethod,
  options: StartLoginOptions = {}
) => {
  if (typeof window === 'undefined') return
  const origin = window.location.origin
  const nextPath = normalizeNextPath(options.next, origin)
  const mode = getSpacetimeAuthMode()
  if (mode === 'dev-session') {
    await startDevSessionLogin(method, nextPath)
    return
  }
  if (mode !== 'hosted') {
    throw new Error('Hosted auth is not configured for this site.')
  }
  if (!isHostedSocialProvider(method)) {
    throw new Error('Use the email and password form to sign in or create an account.')
  }

  const response = await postHostedJson<BetterAuthRedirectResponse>(
    origin,
    '/sign-in/social',
    {
      callbackURL: `${origin}/login/callback?next=${encodeURIComponent(nextPath)}`,
      disableRedirect: true,
      provider: method
    },
    `Unable to start the ${method} sign-in flow.`
  )

  const redirectUrl = normalizeOptionalString(response?.url)
  if (!redirectUrl) {
    throw new Error(`The ${method} sign-in flow did not return a redirect URL.`)
  }
  window.location.assign(redirectUrl)
}

export const completeSpacetimeAuthCallback = async (
  callbackUrl: string,
  apiBase = appConfig.apiBase
): Promise<HostedAuthResult> => {
  if (typeof window === 'undefined') {
    throw new Error('The hosted auth callback can only complete in the browser.')
  }

  const origin = window.location.origin
  const url = new URL(callbackUrl, origin)
  const authError = normalizeOptionalString(url.searchParams.get('error'))
  const authErrorDescription = normalizeOptionalString(url.searchParams.get('error_description'))
  if (authError) {
    throw new Error(authErrorDescription ?? authError)
  }

  const session = await restoreHostedSession(origin, apiBase)
  if (!session) {
    throw new Error('The hosted auth callback completed without creating a session.')
  }

  return {
    next: normalizeNextPath(url.searchParams.get('next') ?? undefined, origin),
    session
  }
}

export const refreshSpacetimeAuthSession = async (apiBase = appConfig.apiBase) => {
  if (typeof window === 'undefined') return null
  if (getSpacetimeAuthMode() !== 'hosted') return null
  return await restoreHostedSession(window.location.origin, apiBase)
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
  if (shouldAttemptBootstrapRefresh()) {
    await attemptBootstrapSession(origin, apiBase)
  }
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

const readStoredPreferredSpacetimeDbUri = (origin: string, moduleName: string) => {
  if (typeof window === 'undefined') return null
  const stored = parseJson<StoredPreferredSpacetimeDbUri>(
    readStorage(window.localStorage, preferredSpacetimeDbUriStorageKey)
  )
  if (!stored) return null

  const normalizedOrigin = normalizeAbsoluteUrl(origin)
  const normalizedStoredUri = normalizeAbsoluteUrl(stored.uri)
  const isExpired = Date.now() - stored.updatedAt > preferredSpacetimeDbUriTtlMs

  if (
    isExpired ||
    !normalizedOrigin ||
    !normalizedStoredUri ||
    stored.origin !== normalizedOrigin ||
    stored.moduleName !== moduleName
  ) {
    removeStorage(window.localStorage, preferredSpacetimeDbUriStorageKey)
    return null
  }

  return normalizedStoredUri
}

export const resolveSpacetimeDbClientConfig = async (apiBase = appConfig.apiBase) => {
  const token = await getSpacetimeDbAuthToken(apiBase)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const moduleName = appConfig.spacetimeDbModule || templateBranding.ids.spacetimeModule
  const fallbackUri = origin ? resolveDirectSpacetimeDbUri(origin) : appConfig.spacetimeDbUri
  const preferredUri = origin ? readStoredPreferredSpacetimeDbUri(origin, moduleName) : null
  return {
    module: moduleName,
    token,
    uri: preferredUri || appConfig.spacetimeDbUri || fallbackUri
  }
}

export const signOutSpacetimeAuth = async (apiBase = appConfig.apiBase) => {
  if (typeof window === 'undefined') return '/'
  const origin = window.location.origin

  try {
    await fetch(buildAuthUrl('/sign-out', origin), {
      method: 'POST',
      credentials: 'include',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json'
      },
      body: '{}'
    })
  } catch {
    // Clearing local state is enough to sign out the browser experience.
  }

  try {
    await fetch(buildPublicSiteAuthUrl('/auth/logout', origin), {
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
  navigator.serviceWorker?.controller?.postMessage({ type: 'sw:clear-user-cache' })

  return appConfig.authPostLogoutRedirectUri ?? appConfig.spacetimeAuthPostLogoutRedirectUri ?? `${origin}/`
}

export const isSpacetimeAuthConfigured = () => getSpacetimeAuthMode() !== 'disabled'
