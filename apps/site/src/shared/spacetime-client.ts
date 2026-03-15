import type { DbConnection as SpacetimeDbConnection } from '@prometheus/spacetimedb-client'
import { installTrustedTypesFunctionBridge } from '../security/client'
import { resolveSpacetimeDbClientConfig } from './spacetime-auth'

export type SpacetimeConnectionStatus = 'idle' | 'connecting' | 'live' | 'offline' | 'error'

export type SpacetimeConnectionSnapshot = {
  connection: SpacetimeDbConnection | null
  error: string | null
  identity: string | null
  moduleName: string | null
  status: SpacetimeConnectionStatus
  token: string | null
  uri: string | null
}

type SnapshotListener = (snapshot: SpacetimeConnectionSnapshot) => void

const reconnectBaseDelayMs = 1_500
const reconnectMaxDelayMs = 30_000
const candidateConnectTimeoutMs = 2_500
const preferredUriStorageKey = 'spacetimedb:preferred-uri:v1'
const preferredUriTtlMs = 7 * 24 * 60 * 60 * 1000

type StoredPreferredUri = {
  moduleName: string
  origin: string
  updatedAt: number
  uri: string
}

type SpacetimeClientModule = typeof import('@prometheus/spacetimedb-client')

let snapshot: SpacetimeConnectionSnapshot = {
  connection: null,
  error: null,
  identity: null,
  moduleName: null,
  status: 'idle',
  token: null,
  uri: null
}

let connectionPromise: Promise<SpacetimeDbConnection | null> | null = null
let connectionGeneration = 0
let reconnectAttempt = 0
let reconnectTimer: number | null = null
let browserEventsBound = false
let spacetimeClientModulePromise: Promise<SpacetimeClientModule> | null = null

const listeners = new Set<SnapshotListener>()

export const loadSpacetimeClient = async (): Promise<SpacetimeClientModule> => {
  if (!spacetimeClientModulePromise) {
    installTrustedTypesFunctionBridge()
    spacetimeClientModulePromise = import('@prometheus/spacetimedb-client')
  }
  return await spacetimeClientModulePromise
}

const cloneSnapshot = () => ({ ...snapshot })

const readStorage = (key: string) => {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const writeStorage = (key: string, value: string) => {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

const removeStorage = (key: string) => {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.removeItem(key)
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

const notifyListeners = () => {
  const next = cloneSnapshot()
  listeners.forEach((listener) => listener(next))
}

const updateSnapshot = (partial: Partial<SpacetimeConnectionSnapshot>) => {
  snapshot = { ...snapshot, ...partial }
  notifyListeners()
}

const isBrowserOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

const clearReconnectTimer = () => {
  if (typeof window === 'undefined') return
  if (reconnectTimer === null) return
  window.clearTimeout(reconnectTimer)
  reconnectTimer = null
}

const scheduleReconnect = () => {
  if (typeof window === 'undefined') return
  if (reconnectTimer !== null) return
  if (isBrowserOffline()) {
    updateSnapshot({ status: 'offline' })
    return
  }
  reconnectAttempt += 1
  const exponentialDelay = reconnectBaseDelayMs * 2 ** Math.max(0, reconnectAttempt - 1)
  const cappedDelay = Math.min(exponentialDelay, reconnectMaxDelayMs)
  const jitter = Math.random() * cappedDelay * 0.25
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null
    void ensureSpacetimeConnection({ force: true })
  }, cappedDelay + jitter)
}

const bindBrowserEvents = () => {
  if (typeof window === 'undefined' || browserEventsBound) return
  browserEventsBound = true
  window.addEventListener('online', () => {
    reconnectAttempt = 0
    clearReconnectTimer()
    void ensureSpacetimeConnection({ force: true })
  })
  window.addEventListener('offline', () => {
    clearReconnectTimer()
    updateSnapshot({ status: 'offline' })
  })
}

const disconnectCurrentConnection = () => {
  const current = snapshot.connection
  if (!current) return
  try {
    current.disconnect()
  } catch {
    // Ignore teardown failures during reconnect/shutdown.
  }
}

export const getSpacetimeConnectionSnapshot = () => cloneSnapshot()

export const subscribeSpacetimeConnection = (listener: SnapshotListener) => {
  bindBrowserEvents()
  listeners.add(listener)
  listener(cloneSnapshot())
  return () => {
    listeners.delete(listener)
  }
}

export const resetSpacetimeConnection = () => {
  clearReconnectTimer()
  connectionPromise = null
  connectionGeneration += 1
  disconnectCurrentConnection()
  reconnectAttempt = 0
  updateSnapshot({
    connection: null,
    error: null,
    identity: null,
    status: 'idle',
    token: null,
    uri: null
  })
}

type EnsureOptions = {
  force?: boolean
}

const normalizeCandidateUri = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return ''
  try {
    return new URL(trimmed).toString()
  } catch {
    return trimmed
  }
}

const shouldPreferSameOriginProxy = (uri: string, origin: string) => {
  try {
    const candidateUrl = new URL(uri)
    const originUrl = new URL(origin)
    if (candidateUrl.origin === originUrl.origin) return false
    return candidateUrl.hostname === `db.${originUrl.hostname}`
  } catch {
    return false
  }
}

const readStoredPreferredUri = (moduleName: string) => {
  const stored = parseJson<StoredPreferredUri>(readStorage(preferredUriStorageKey))
  if (!stored) return null

  const normalizedOrigin =
    typeof window !== 'undefined' ? normalizeCandidateUri(window.location.origin) : ''
  const normalizedUri = normalizeCandidateUri(stored.uri)

  const isExpired = Date.now() - stored.updatedAt > preferredUriTtlMs
  if (
    isExpired ||
    stored.moduleName !== moduleName ||
    !normalizedOrigin ||
    stored.origin !== normalizedOrigin ||
    !normalizedUri
  ) {
    removeStorage(preferredUriStorageKey)
    return null
  }

  return normalizedUri
}

const writeStoredPreferredUri = (moduleName: string, uri: string) => {
  if (typeof window === 'undefined') return
  const normalizedUri = normalizeCandidateUri(uri)
  const normalizedOrigin = normalizeCandidateUri(window.location.origin)
  if (!normalizedUri || !normalizedOrigin) return

  writeStorage(
    preferredUriStorageKey,
    JSON.stringify({
      moduleName,
      origin: normalizedOrigin,
      updatedAt: Date.now(),
      uri: normalizedUri
    } satisfies StoredPreferredUri)
  )
}

export const resolveCandidateUris = ({
  uri,
  moduleName,
  currentOrigin,
  storedPreferredUri
}: {
  uri: string
  moduleName: string
  currentOrigin?: string | null
  storedPreferredUri?: string | null
}) => {
  const candidates: string[] = []
  const pushCandidate = (value: string | null | undefined) => {
    if (!value) return
    const normalized = normalizeCandidateUri(value)
    if (!normalized || candidates.includes(normalized)) return
    candidates.push(normalized)
  }

  const resolvedOrigin =
    currentOrigin ?? (typeof window !== 'undefined' ? window.location.origin : null)
  const preferredUri =
    storedPreferredUri === undefined ? readStoredPreferredUri(moduleName) : storedPreferredUri

  pushCandidate(preferredUri)

  const prefersSameOriginProxy =
    typeof resolvedOrigin === 'string' &&
    resolvedOrigin.trim() !== '' &&
    shouldPreferSameOriginProxy(uri, resolvedOrigin)

  if (prefersSameOriginProxy) {
    pushCandidate(resolvedOrigin)
  }

  pushCandidate(uri)

  if (typeof resolvedOrigin === 'string' && resolvedOrigin.trim() !== '') {
    pushCandidate(resolvedOrigin)
  }

  return candidates
}

export const ensureSpacetimeConnection = async (
  options: EnsureOptions = {}
): Promise<SpacetimeDbConnection | null> => {
  if (typeof window === 'undefined') return null
  bindBrowserEvents()

  const resolved = await resolveSpacetimeDbClientConfig()
  const uri = resolved.uri?.trim() ?? ''
  const moduleName = resolved.module?.trim() ?? ''
  const token = resolved.token?.trim() ?? null
  const candidateUris = resolveCandidateUris({ uri, moduleName })

  if (!uri || !moduleName) {
    updateSnapshot({
      connection: null,
      error: 'SpaceTimeDB is not configured for this site.',
      moduleName: moduleName || null,
      status: 'error',
      token,
      uri: uri || null
    })
    return null
  }

  const connectionMatches =
    snapshot.connection !== null &&
    snapshot.uri !== null &&
    candidateUris.includes(snapshot.uri) &&
    snapshot.moduleName === moduleName &&
    snapshot.token === token &&
    snapshot.status === 'live'

  if (connectionMatches && !options.force) {
    return snapshot.connection
  }

  if (connectionPromise && !options.force) {
    return connectionPromise
  }

  clearReconnectTimer()
  if (isBrowserOffline()) {
    updateSnapshot({
      connection: null,
      error: null,
      moduleName,
      status: 'offline',
      token,
      uri
    })
    return null
  }

  const generation = ++connectionGeneration
  reconnectAttempt = 0
  connectionPromise = new Promise<SpacetimeDbConnection | null>((resolve) => {
    let settled = false
    let activeAttemptId = 0
    const finish = (connection: SpacetimeDbConnection | null) => {
      if (settled) return
      settled = true
      if (connectionPromise !== null && generation === connectionGeneration) {
        connectionPromise = null
      }
      resolve(connection)
    }

    disconnectCurrentConnection()
    const attemptConnection = async (candidateIndex: number) => {
      const attemptId = ++activeAttemptId
      const candidateUri = candidateUris[candidateIndex] ?? uri
      let connectTimeoutId: number | null = null
      let pendingConnection: SpacetimeDbConnection | null = null

      const clearConnectTimeout = () => {
        if (typeof window === 'undefined') return
        if (connectTimeoutId === null) return
        window.clearTimeout(connectTimeoutId)
        connectTimeoutId = null
      }

      const isStaleAttempt = () =>
        generation !== connectionGeneration || attemptId !== activeAttemptId

      updateSnapshot({
        connection: null,
        error: null,
        moduleName,
        status: 'connecting',
        token,
        uri: candidateUri
      })

      const failOrRetry = (message: string) => {
        clearConnectTimeout()
        if (isStaleAttempt()) return

        const nextCandidate = candidateUris[candidateIndex + 1]
        if (nextCandidate) {
          try {
            pendingConnection?.disconnect()
          } catch {
            // Ignore teardown failures while moving to the next candidate.
          }
            void attemptConnection(candidateIndex + 1)
            return
          }

        updateSnapshot({
          connection: null,
          error: message,
          identity: null,
          moduleName,
          status: isBrowserOffline() ? 'offline' : 'error',
          token,
          uri: candidateUri
        })
        scheduleReconnect()
        finish(null)
      }

      try {
        const { DbConnection } = await loadSpacetimeClient()
        if (candidateUris[candidateIndex + 1]) {
          connectTimeoutId = window.setTimeout(() => {
            failOrRetry(`Timed out connecting to ${candidateUri}.`)
          }, candidateConnectTimeoutMs)
        }

        pendingConnection = DbConnection.builder()
          .withUri(candidateUri)
          .withDatabaseName(moduleName)
          .withCompression('gzip')
          .withLightMode(true)
          .withToken(token ?? undefined)
          .onConnect((connection, identity, issuedToken) => {
            clearConnectTimeout()
            if (isStaleAttempt()) {
              connection.disconnect()
              return
            }
            writeStoredPreferredUri(moduleName, candidateUri)
            updateSnapshot({
              connection,
              error: null,
              identity: identity.toHexString(),
              moduleName,
              status: 'live',
              token: token ?? issuedToken ?? null,
              uri: candidateUri
            })
            finish(connection)
          })
          .onConnectError((_, error) => {
            clearConnectTimeout()
            failOrRetry(error.message)
          })
          .onDisconnect((_, error) => {
            clearConnectTimeout()
            if (isStaleAttempt()) return
            const nextCandidate = candidateUris[candidateIndex + 1]
            if (!settled && nextCandidate) {
              void attemptConnection(candidateIndex + 1)
              return
            }
            updateSnapshot({
              connection: null,
              error: error?.message ?? null,
              identity: null,
              moduleName,
              status: isBrowserOffline() ? 'offline' : 'error',
              token,
              uri: candidateUri
            })
            scheduleReconnect()
            if (!settled) {
              finish(null)
            }
          })
          .build()
      } catch (error) {
        failOrRetry(error instanceof Error ? error.message : String(error))
      }
    }

    void attemptConnection(0)
  })

  return connectionPromise
}

export const prewarmSpacetimeConnection = () => {
  if (typeof window === 'undefined') return
  if (snapshot.status === 'connecting' || snapshot.status === 'live') return
  void ensureSpacetimeConnection()
}
