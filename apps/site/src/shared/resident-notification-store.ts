import {
  type ResidentNotificationBroadcastMessage,
  type ResidentNotificationIntentInput,
  type ResidentNotificationRecord,
  type ResidentNotificationStoreFilters,
  buildResidentNotificationId,
  normalizeResidentNotificationKey
} from './resident-notifications'

type NotificationRecordRow = ResidentNotificationRecord

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

type ResidentNotificationStoreOptions = {
  indexedDb?: IdxLike | null
  broadcastFactory?: BroadcastFactory | null
  now?: () => number
}

type ResidentNotificationMeta = Pick<
  ResidentNotificationRecord,
  'fragmentId' | 'lang' | 'path' | 'residentKey' | 'scopeKey'
>

type ResidentNotificationListener = () => void

const DB_NAME = 'prometheus-resident-notifications'
const DB_VERSION = 1
const STORE_NAME = 'intents'
const CHANNEL_NAME = 'prometheus:resident-notifications'

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

const openDatabaseWithVersion = async (indexedDb: IdxLike, version: number) => {
  const request = indexedDb.open(DB_NAME, version)
  request.addEventListener('upgradeneeded', () => {
    const database = request.result
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME, { keyPath: 'id' })
    }
  })
  return await toPromise(request)
}

const openDatabase = async (indexedDb: IdxLike) => {
  const database = await openDatabaseWithVersion(indexedDb, DB_VERSION)
  if (database.objectStoreNames.contains(STORE_NAME)) {
    return database
  }
  const recoveryVersion = Math.max(DB_VERSION + 1, database.version + 1)
  database.close()
  return await openDatabaseWithVersion(indexedDb, recoveryVersion)
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

const matchRecord = (record: ResidentNotificationRecord, filters: ResidentNotificationStoreFilters) => {
  if (typeof filters.scopeKey === 'string' && record.scopeKey !== filters.scopeKey) return false
  if (typeof filters.residentKey === 'string' && record.residentKey !== filters.residentKey) return false
  if (typeof filters.path === 'string' && record.path !== filters.path) return false
  if (typeof filters.lang === 'string' && record.lang !== filters.lang) return false
  if (typeof filters.fragmentId === 'string' && record.fragmentId !== filters.fragmentId) return false
  return true
}

const shouldReplaceRecord = (
  current: ResidentNotificationRecord | undefined,
  next: ResidentNotificationRecord
) => {
  if (!current) return true
  if (next.updatedAt !== current.updatedAt) {
    return next.updatedAt > current.updatedAt
  }
  const currentDeliveredAt = current.deliveredAt ?? 0
  const nextDeliveredAt = next.deliveredAt ?? 0
  return nextDeliveredAt >= currentDeliveredAt
}

export const createResidentNotificationRecord = (
  meta: ResidentNotificationMeta,
  intent: ResidentNotificationIntentInput,
  nowMs = Date.now()
): ResidentNotificationRecord => ({
  id: buildResidentNotificationId(
    meta.scopeKey,
    meta.residentKey,
    normalizeResidentNotificationKey(intent.notificationKey)
  ),
  notificationKey: normalizeResidentNotificationKey(intent.notificationKey),
  kind: intent.kind,
  title: intent.title.trim(),
  body: intent.body.trim(),
  url: typeof intent.url === 'string' && intent.url.trim() ? intent.url.trim() : null,
  deliverAtMs:
    intent.kind === 'scheduled' && typeof intent.deliverAtMs === 'number' && Number.isFinite(intent.deliverAtMs)
      ? intent.deliverAtMs
      : null,
  updatedAt: nowMs,
  deliveredAt: null,
  fragmentId: meta.fragmentId,
  lang: meta.lang,
  path: meta.path,
  residentKey: meta.residentKey,
  scopeKey: meta.scopeKey
})

export const createResidentNotificationStore = (
  options: ResidentNotificationStoreOptions = {}
) => {
  const indexedDb = options.indexedDb ?? (typeof indexedDB !== 'undefined' ? indexedDB : null)
  const now = options.now ?? defaultNow
  const channel = createChannel(options.broadcastFactory)
  const records = new Map<string, ResidentNotificationRecord>()
  const dirtyRecordIds = new Set<string>()
  const listeners = new Set<ResidentNotificationListener>()
  let dbPromise: Promise<IDBDatabase | null> | null = null
  let hydratePromise: Promise<void> | null = null
  let hydrateComplete = false

  const notifyListeners = () => {
    listeners.forEach((listener) => {
      listener()
    })
  }

  const getDb = async () => {
    if (!canUseIndexedDb(indexedDb)) {
      return null
    }
    if (!dbPromise) {
      dbPromise = openDatabase(indexedDb).catch(() => null)
    }
    return await dbPromise
  }

  const handleBroadcast = (event: MessageEvent<unknown>) => {
    const message = event.data as ResidentNotificationBroadcastMessage | null
    if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
      return
    }

    if (message.type === 'intent-upserted') {
      const nextRecord = message.record
      const current = records.get(nextRecord.id)
      if (shouldReplaceRecord(current, nextRecord)) {
        records.set(nextRecord.id, nextRecord)
        notifyListeners()
      }
      return
    }

    if (message.type === 'intent-cleared') {
      if (records.delete(message.id)) {
        notifyListeners()
      }
      return
    }

    if (message.type === 'intent-delivered') {
      const current = records.get(message.id)
      if (!current) return
      const deliveredAt = Math.max(current.deliveredAt ?? 0, message.deliveredAt)
      if (deliveredAt === current.deliveredAt) return
      records.set(message.id, {
        ...current,
        deliveredAt
      })
      notifyListeners()
    }
  }

  channel?.addEventListener('message', handleBroadcast)

  const postBroadcast = (message: ResidentNotificationBroadcastMessage) => {
    try {
      channel?.postMessage(message)
    } catch {
      // Ignore best-effort sync failures.
    }
  }

  const hydrate = async () => {
    if (hydratePromise) {
      return await hydratePromise
    }

    hydratePromise = (async () => {
      const database = await getDb()
      if (!database) {
        hydrateComplete = true
        return
      }

      const transaction = database.transaction(STORE_NAME, 'readonly')
      const rows = (await toPromise(transaction.objectStore(STORE_NAME).getAll())) as NotificationRecordRow[]
      rows.forEach((row) => {
        if (dirtyRecordIds.has(row.id) && records.has(row.id)) {
          return
        }
        const current = records.get(row.id)
        if (!shouldReplaceRecord(current, row)) {
          return
        }
        records.set(row.id, row)
      })
      await awaitTransaction(transaction)
      hydrateComplete = true
    })()

    return await hydratePromise
  }

  const writeRecord = async (record: ResidentNotificationRecord) => {
    dirtyRecordIds.add(record.id)
    records.set(record.id, record)
    const database = await getDb()
    if (database) {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).put(record satisfies NotificationRecordRow)
      await awaitTransaction(transaction)
    }
  }

  const deleteRecords = async (ids: string[]) => {
    if (!ids.length) return
    ids.forEach((id) => {
      dirtyRecordIds.add(id)
      records.delete(id)
    })
    const database = await getDb()
    if (database) {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      ids.forEach((id) => {
        store.delete(id)
      })
      await awaitTransaction(transaction)
    }
  }

  return {
    records,
    hydrate,
    isHydrated() {
      return hydrateComplete
    },
    subscribe(listener: ResidentNotificationListener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    async upsertIntent(meta: ResidentNotificationMeta, intent: ResidentNotificationIntentInput) {
      const record = createResidentNotificationRecord(meta, intent, now())
      await writeRecord(record)
      postBroadcast({
        type: 'intent-upserted',
        record
      })
      notifyListeners()
      return record
    },
    async markDelivered(id: string, deliveredAt = now()) {
      const current = records.get(id)
      if (!current) return null
      const nextRecord: ResidentNotificationRecord = {
        ...current,
        deliveredAt
      }
      await writeRecord(nextRecord)
      postBroadcast({
        type: 'intent-delivered',
        id,
        deliveredAt
      })
      notifyListeners()
      return nextRecord
    },
    async clearIntent(id: string) {
      await deleteRecords([id])
      postBroadcast({
        type: 'intent-cleared',
        id
      })
      notifyListeners()
    },
    async clearMatching(filters: ResidentNotificationStoreFilters) {
      const ids = Array.from(records.values())
        .filter((record) => matchRecord(record, filters))
        .map((record) => record.id)
      await deleteRecords(ids)
      ids.forEach((id) => {
        postBroadcast({
          type: 'intent-cleared',
          id
        })
      })
      if (ids.length) {
        notifyListeners()
      }
    },
    listPending() {
      return Array.from(records.values())
        .filter((record) => record.deliveredAt === null)
        .sort((left, right) => {
          const leftAt = left.deliverAtMs ?? left.updatedAt
          const rightAt = right.deliverAtMs ?? right.updatedAt
          return leftAt - rightAt
        })
    },
    listDuePending(nowMs = now()) {
      return this.listPending().filter(
        (record) => record.kind === 'immediate' || (record.deliverAtMs ?? 0) <= nowMs
      )
    },
    get(id: string) {
      return records.get(id) ?? null
    },
    close() {
      listeners.clear()
      channel?.removeEventListener('message', handleBroadcast)
      channel?.close()
    }
  }
}

export type ResidentNotificationStore = ReturnType<typeof createResidentNotificationStore>
