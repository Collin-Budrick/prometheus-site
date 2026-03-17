import type { FragmentPayload } from '../types'

export type CachedFragmentPayload = {
  payload: FragmentPayload
  version: string
}

export type HeightLearnedValue = {
  height: number
}

type PayloadRecord = {
  key: string
  path: string
  lang: string
  fragmentId: string
  version: string
  savedAt: number
  payload: FragmentPayload
}

type LearnedSizingRecord = {
  key: string
  savedAt: number
  height: number
}

type IdxLike = {
  open: (name: string, version?: number) => IDBOpenDBRequest
}

type BroadcastLike = {
  postMessage: (message: unknown) => void
  close: () => void
  addEventListener: (type: 'message', listener: (event: MessageEvent<unknown>) => void) => void
  removeEventListener: (type: 'message', listener: (event: MessageEvent<unknown>) => void) => void
}

type BroadcastFactory = (name: string) => BroadcastLike

type PersistentRuntimeCacheOptions = {
  indexedDb?: IdxLike | null
  broadcastFactory?: BroadcastFactory | null
  now?: () => number
}

export type FragmentRuntimeBroadcastMessage =
  | { type: 'payload-written'; key: string; version: string; payload?: FragmentPayload }
  | { type: 'payload-invalidated'; key: string; version?: string }
  | { type: 'request-claim'; key: string; owner: string }
  | { type: 'request-release'; key: string; owner: string }

const DB_NAME = 'prometheus-fragment-runtime'
const DB_VERSION = 1
const PAYLOAD_STORE = 'payloads'
const LEARNED_SIZING_STORE = 'learnedSizing'
const PAYLOAD_MAX_AGE_MS = 24 * 60 * 60 * 1000
const PAYLOAD_MAX_ENTRIES = 200
const CHANNEL_NAME = 'prometheus:fragment-runtime'

const defaultNow = () => Date.now()

const canUseIndexedDb = (indexedDb: IdxLike | null | undefined): indexedDb is IdxLike =>
  indexedDb !== null && typeof indexedDb?.open === 'function'

const toPromise = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result))
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('IndexedDB request failed'))
    })
  })

const awaitTransaction = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve())
    transaction.addEventListener('abort', () => {
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
    })
    transaction.addEventListener('error', () => {
      reject(transaction.error ?? new Error('IndexedDB transaction failed'))
    })
  })

const openDatabase = async (indexedDb: IdxLike) => {
  const request = indexedDb.open(DB_NAME, DB_VERSION)
  request.addEventListener('upgradeneeded', () => {
    const database = request.result
    if (!database.objectStoreNames.contains(PAYLOAD_STORE)) {
      database.createObjectStore(PAYLOAD_STORE, { keyPath: 'key' })
    }
    if (!database.objectStoreNames.contains(LEARNED_SIZING_STORE)) {
      database.createObjectStore(LEARNED_SIZING_STORE, { keyPath: 'key' })
    }
  })
  return await toPromise(request)
}

export const buildPayloadCacheKey = (path: string, lang: string, fragmentId: string) =>
  `${path}::${lang}::${fragmentId}`

export const buildLearnedHeightKey = (
  path: string,
  lang: string,
  fragmentId: string,
  widthBucket: string | null
) => `${path}::${lang}::${fragmentId}::${widthBucket ?? ''}`

export const buildPayloadVersion = (payload: FragmentPayload) => {
  const { cacheKey } = payload.meta
  if (typeof payload.cacheUpdatedAt === 'number') {
    return `${cacheKey}:${payload.cacheUpdatedAt}`
  }
  return cacheKey
}

const createChannel = (factory?: BroadcastFactory | null) => {
  try {
    if (factory) {
      return factory(CHANNEL_NAME)
    }
    if (typeof BroadcastChannel === 'function') {
      return new BroadcastChannel(CHANNEL_NAME)
    }
  } catch {
    return null
  }
  return null
}

export const createPersistentRuntimeCache = (options: PersistentRuntimeCacheOptions = {}) => {
  const indexedDb = options.indexedDb ?? (typeof indexedDB !== 'undefined' ? indexedDB : null)
  const now = options.now ?? defaultNow
  const payloads = new Map<string, CachedFragmentPayload>()
  const learnedHeights = new Map<string, HeightLearnedValue>()
  const claims = new Map<string, string>()
  const pendingWaiters = new Map<string, Array<() => void>>()
  const channel = createChannel(options.broadcastFactory)
  let dbPromise: Promise<IDBDatabase | null> | null = null
  let hydratePromise: Promise<void> | null = null

  const getDb = async () => {
    if (!canUseIndexedDb(indexedDb)) {
      return null
    }
    if (!dbPromise) {
      dbPromise = openDatabase(indexedDb).catch(() => null)
    }
    return await dbPromise
  }

  const prunePayloadStore = async (database: IDBDatabase) => {
    const transaction = database.transaction(PAYLOAD_STORE, 'readwrite')
    const store = transaction.objectStore(PAYLOAD_STORE)
    const records = (await toPromise(store.getAll())) as PayloadRecord[]
    const cutoff = now() - PAYLOAD_MAX_AGE_MS
    const stale = records.filter((record) => record.savedAt < cutoff)
    stale.forEach((record) => store.delete(record.key))
    const fresh = records
      .filter((record) => record.savedAt >= cutoff)
      .sort((left, right) => right.savedAt - left.savedAt)
    fresh.slice(PAYLOAD_MAX_ENTRIES).forEach((record) => store.delete(record.key))
    await awaitTransaction(transaction)
  }

  const hydrate = async () => {
    if (hydratePromise) {
      return await hydratePromise
    }
    hydratePromise = (async () => {
      const database = await getDb()
      if (!database) {
        return
      }
      await prunePayloadStore(database)
      const payloadTransaction = database.transaction(PAYLOAD_STORE, 'readonly')
      const payloadStore = payloadTransaction.objectStore(PAYLOAD_STORE)
      const payloadRecords = (await toPromise(payloadStore.getAll())) as PayloadRecord[]
      payloads.clear()
      payloadRecords.forEach((record) => {
        payloads.set(record.key, {
          payload: record.payload,
          version: record.version
        })
      })
      await awaitTransaction(payloadTransaction)

      const learnedTransaction = database.transaction(LEARNED_SIZING_STORE, 'readonly')
      const learnedStore = learnedTransaction.objectStore(LEARNED_SIZING_STORE)
      const learnedRecords = (await toPromise(learnedStore.getAll())) as LearnedSizingRecord[]
      learnedHeights.clear()
      learnedRecords.forEach((record) => {
        learnedHeights.set(record.key, {
          height: record.height
        })
      })
      await awaitTransaction(learnedTransaction)
    })()
    return await hydratePromise
  }

  const postBroadcast = (message: FragmentRuntimeBroadcastMessage) => {
    try {
      channel?.postMessage(message)
    } catch {
      // Ignore best-effort sync failures.
    }
  }

  const resolveWaiters = (key: string) => {
    const waiters = pendingWaiters.get(key)
    if (!waiters?.length) return
    pendingWaiters.delete(key)
    waiters.forEach((resolve) => resolve())
  }

  const handleBroadcast = (event: MessageEvent<unknown>) => {
    const message = event.data as FragmentRuntimeBroadcastMessage | null
    if (!message || typeof message !== 'object' || !('type' in message)) return
    switch (message.type) {
      case 'payload-written':
        if (message.payload) {
          payloads.set(message.key, {
            payload: message.payload,
            version: message.version
          })
        }
        resolveWaiters(message.key)
        return
      case 'payload-invalidated':
        payloads.delete(message.key)
        resolveWaiters(message.key)
        return
      case 'request-claim':
        claims.set(message.key, message.owner)
        return
      case 'request-release':
        if (claims.get(message.key) === message.owner) {
          claims.delete(message.key)
        }
        resolveWaiters(message.key)
        return
    }
  }

  channel?.addEventListener('message', handleBroadcast)

  const writePayloadRecord = async (key: string, path: string, lang: string, payload: FragmentPayload) => {
    payloads.set(key, {
      payload,
      version: buildPayloadVersion(payload)
    })
    const database = await getDb()
    if (!database) {
      postBroadcast({
        type: 'payload-written',
        key,
        version: buildPayloadVersion(payload),
        payload
      })
      return
    }
    const transaction = database.transaction(PAYLOAD_STORE, 'readwrite')
    const store = transaction.objectStore(PAYLOAD_STORE)
    store.put({
      key,
      path,
      lang,
      fragmentId: payload.id,
      version: buildPayloadVersion(payload),
      savedAt: now(),
      payload
    } satisfies PayloadRecord)
    await awaitTransaction(transaction)
    postBroadcast({
      type: 'payload-written',
      key,
      version: buildPayloadVersion(payload),
      payload
    })
  }

  const deletePayloadRecord = async (key: string, version?: string) => {
    payloads.delete(key)
    const database = await getDb()
    if (database) {
      const transaction = database.transaction(PAYLOAD_STORE, 'readwrite')
      transaction.objectStore(PAYLOAD_STORE).delete(key)
      await awaitTransaction(transaction)
    }
    postBroadcast({
      type: 'payload-invalidated',
      key,
      version
    })
  }

  const writeLearnedHeightRecord = async (key: string, height: number) => {
    learnedHeights.set(key, { height })
    const database = await getDb()
    if (!database) {
      return
    }
    const transaction = database.transaction(LEARNED_SIZING_STORE, 'readwrite')
    transaction.objectStore(LEARNED_SIZING_STORE).put({
      key,
      savedAt: now(),
      height
    } satisfies LearnedSizingRecord)
    await awaitTransaction(transaction)
  }

  return {
    payloads,
    learnedHeights,
    claims,
    hydrate,
    async seedPayload(path: string, lang: string, payload: FragmentPayload) {
      await hydrate()
      const key = buildPayloadCacheKey(path, lang, payload.id)
      await writePayloadRecord(key, path, lang, payload)
    },
    async seedPayloads(path: string, lang: string, nextPayloads: FragmentPayload[]) {
      await hydrate()
      await Promise.all(nextPayloads.map((payload) => writePayloadRecord(buildPayloadCacheKey(path, lang, payload.id), path, lang, payload)))
    },
    async invalidatePayload(path: string, lang: string, fragmentId: string, version?: string) {
      await hydrate()
      await deletePayloadRecord(buildPayloadCacheKey(path, lang, fragmentId), version)
    },
    async writeLearnedHeight(key: string, height: number) {
      await hydrate()
      await writeLearnedHeightRecord(key, height)
    },
    async claimFetch(key: string, owner: string) {
      await hydrate()
      const existing = claims.get(key)
      if (existing && existing !== owner) {
        return false
      }
      claims.set(key, owner)
      postBroadcast({
        type: 'request-claim',
        key,
        owner
      })
      return true
    },
    releaseFetch(key: string, owner: string) {
      if (claims.get(key) === owner) {
        claims.delete(key)
      }
      postBroadcast({
        type: 'request-release',
        key,
        owner
      })
    },
    waitForPayloadWrite(key: string, timeoutMs: number) {
      if (timeoutMs <= 0) {
        return Promise.resolve(false)
      }
      return new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          const nextWaiters = pendingWaiters.get(key)?.filter((fn) => fn !== onResolve) ?? []
          if (nextWaiters.length) {
            pendingWaiters.set(key, nextWaiters)
          } else {
            pendingWaiters.delete(key)
          }
          resolve(false)
        }, timeoutMs)
        const onResolve = () => {
          clearTimeout(timeout)
          resolve(true)
        }
        const waiters = pendingWaiters.get(key) ?? []
        waiters.push(onResolve)
        pendingWaiters.set(key, waiters)
      })
    },
    close() {
      channel?.removeEventListener('message', handleBroadcast)
      channel?.close()
    }
  }
}

export const FRAGMENT_RUNTIME_PAYLOAD_MAX_AGE_MS = PAYLOAD_MAX_AGE_MS
export const FRAGMENT_RUNTIME_PAYLOAD_MAX_ENTRIES = PAYLOAD_MAX_ENTRIES
