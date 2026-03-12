import { DbConnection } from '@prometheus/spacetimedb-client'
import type { DbConnection as SpacetimeDbConnection } from '@prometheus/spacetimedb-client'
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

const listeners = new Set<SnapshotListener>()

const cloneSnapshot = () => ({ ...snapshot })

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

export const ensureSpacetimeConnection = async (
  options: EnsureOptions = {}
): Promise<SpacetimeDbConnection | null> => {
  if (typeof window === 'undefined') return null
  bindBrowserEvents()

  const resolved = await resolveSpacetimeDbClientConfig()
  const uri = resolved.uri?.trim() ?? ''
  const moduleName = resolved.module?.trim() ?? ''
  const token = resolved.token?.trim() ?? null

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
    snapshot.uri === uri &&
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
    const finish = (connection: SpacetimeDbConnection | null) => {
      if (settled) return
      settled = true
      if (connectionPromise !== null && generation === connectionGeneration) {
        connectionPromise = null
      }
      resolve(connection)
    }

    disconnectCurrentConnection()
    updateSnapshot({
      connection: null,
      error: null,
      moduleName,
      status: 'connecting',
      token,
      uri
    })

    try {
      DbConnection.builder()
        .withUri(uri)
        .withDatabaseName(moduleName)
        .withCompression('gzip')
        .withLightMode(true)
        .withToken(token ?? undefined)
        .onConnect((connection, identity, issuedToken) => {
          if (generation !== connectionGeneration) {
            connection.disconnect()
            finish(null)
            return
          }
          updateSnapshot({
            connection,
            error: null,
            identity: identity.toHexString(),
            moduleName,
            status: 'live',
            token: token ?? issuedToken ?? null,
            uri
          })
          finish(connection)
        })
        .onConnectError((_, error) => {
          if (generation !== connectionGeneration) {
            finish(null)
            return
          }
          updateSnapshot({
            connection: null,
            error: error.message,
            identity: null,
            moduleName,
            status: isBrowserOffline() ? 'offline' : 'error',
            token,
            uri
          })
          scheduleReconnect()
          finish(null)
        })
        .onDisconnect((_, error) => {
          if (generation !== connectionGeneration) return
          updateSnapshot({
            connection: null,
            error: error?.message ?? null,
            identity: null,
            moduleName,
            status: isBrowserOffline() ? 'offline' : 'error',
            token,
            uri
          })
          scheduleReconnect()
        })
        .build()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      updateSnapshot({
        connection: null,
        error: message,
        identity: null,
        moduleName,
        status: isBrowserOffline() ? 'offline' : 'error',
        token,
        uri
      })
      scheduleReconnect()
      finish(null)
    }
  })

  return connectionPromise
}
