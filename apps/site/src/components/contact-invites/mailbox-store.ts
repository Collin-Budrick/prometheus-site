import type { RelayMessage, RelaySendRequest } from './relay'

export type MailboxOutgoingEntry = {
  id: string
  request: RelaySendRequest
  createdAt: string
  attempts: number
  lastAttemptAt?: string
  nextAttemptAt?: string
  deliveredAt?: string
  deliveredCount?: number
}

export type MailboxIncomingEntry = RelayMessage & {
  receivedAt: string
  ackedAt?: string
}

const outgoingStore = 'outgoing'
const incomingStore = 'incoming'

const ensureBrowser = () => {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    throw new Error('Mailbox storage unavailable')
  }
}

const openMailboxDb = (deviceId: string) =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(`chat:p2p:mailbox:${deviceId}`, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(outgoingStore)) {
        db.createObjectStore(outgoingStore, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(incomingStore)) {
        db.createObjectStore(incomingStore, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const requestToPromise = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const transactionDone = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })

const readAll = async <T>(db: IDBDatabase, storeName: string) => {
  const tx = db.transaction(storeName, 'readonly')
  const store = tx.objectStore(storeName)
  const result = await requestToPromise(store.getAll())
  await transactionDone(tx)
  return result as T[]
}

const readKey = async <T>(db: IDBDatabase, storeName: string, key: string) => {
  const tx = db.transaction(storeName, 'readonly')
  const store = tx.objectStore(storeName)
  const result = await requestToPromise(store.get(key))
  await transactionDone(tx)
  return result as T | undefined
}

const writeKey = async <T>(db: IDBDatabase, storeName: string, value: T) => {
  const tx = db.transaction(storeName, 'readwrite')
  const store = tx.objectStore(storeName)
  await requestToPromise(store.put(value))
  await transactionDone(tx)
}

const writeBulk = async <T>(db: IDBDatabase, storeName: string, values: T[]) => {
  const tx = db.transaction(storeName, 'readwrite')
  const store = tx.objectStore(storeName)
  await Promise.all(values.map((entry) => requestToPromise(store.put(entry))))
  await transactionDone(tx)
}

const normalizeOutgoingEntry = (entry: MailboxOutgoingEntry) => {
  if (!entry?.id || !entry.request) return null
  if (!entry.request.messageId || entry.request.messageId !== entry.id) return null
  const createdAt = entry.createdAt || new Date().toISOString()
  const attempts = Number.isFinite(entry.attempts) && entry.attempts >= 0 ? entry.attempts : 0
  return {
    ...entry,
    createdAt,
    attempts
  } satisfies MailboxOutgoingEntry
}

export const loadMailboxOutgoing = async (deviceId: string) => {
  ensureBrowser()
  const db = await openMailboxDb(deviceId)
  const entries = await readAll<MailboxOutgoingEntry>(db, outgoingStore)
  return entries
    .map((entry) => normalizeOutgoingEntry(entry))
    .filter((entry): entry is MailboxOutgoingEntry => Boolean(entry))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export const readMailboxOutgoing = async (deviceId: string, messageId: string) => {
  ensureBrowser()
  const db = await openMailboxDb(deviceId)
  const entry = await readKey<MailboxOutgoingEntry>(db, outgoingStore, messageId)
  return entry ? normalizeOutgoingEntry(entry) : null
}

export const enqueueMailboxOutgoing = async (deviceId: string, request: RelaySendRequest) => {
  ensureBrowser()
  if (!request.messageId) return null
  const db = await openMailboxDb(deviceId)
  const existing = await readKey<MailboxOutgoingEntry>(db, outgoingStore, request.messageId)
  const base: MailboxOutgoingEntry = {
    id: request.messageId,
    request,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    attempts: existing?.attempts ?? 0,
    lastAttemptAt: existing?.lastAttemptAt,
    nextAttemptAt: existing?.nextAttemptAt,
    deliveredAt: existing?.deliveredAt,
    deliveredCount: existing?.deliveredCount
  }
  const normalized = normalizeOutgoingEntry(base)
  if (!normalized) return null
  await writeKey(db, outgoingStore, normalized)
  return normalized
}

export const updateMailboxOutgoing = async (
  deviceId: string,
  messageId: string,
  update: Partial<Omit<MailboxOutgoingEntry, 'id' | 'request'>> & { request?: RelaySendRequest }
) => {
  ensureBrowser()
  const db = await openMailboxDb(deviceId)
  const existing = await readKey<MailboxOutgoingEntry>(db, outgoingStore, messageId)
  if (!existing) return null
  const next: MailboxOutgoingEntry = {
    ...existing,
    ...update,
    request: update.request ?? existing.request
  }
  const normalized = normalizeOutgoingEntry(next)
  if (!normalized) return null
  await writeKey(db, outgoingStore, normalized)
  return normalized
}

export const recordMailboxIncoming = async (deviceId: string, messages: RelayMessage[]) => {
  ensureBrowser()
  if (!messages.length) return []
  const db = await openMailboxDb(deviceId)
  const incoming: MailboxIncomingEntry[] = []
  for (const message of messages) {
    const existing = await readKey<MailboxIncomingEntry>(db, incomingStore, message.id)
    if (existing) continue
    incoming.push({
      ...message,
      receivedAt: new Date().toISOString()
    })
  }
  if (!incoming.length) return []
  await writeBulk(db, incomingStore, incoming)
  return incoming
}

export const markMailboxIncomingAcked = async (deviceId: string, messageIds: string[]) => {
  ensureBrowser()
  if (!messageIds.length) return 0
  const db = await openMailboxDb(deviceId)
  const allEntries = await readAll<MailboxIncomingEntry>(db, incomingStore)
  const now = new Date().toISOString()
  const next = allEntries.map((entry) =>
    messageIds.includes(entry.id) ? { ...entry, ackedAt: now } : entry
  )
  await writeBulk(db, incomingStore, next)
  return messageIds.length
}

export const loadMailboxIncoming = async (deviceId: string) => {
  ensureBrowser()
  const db = await openMailboxDb(deviceId)
  const entries = await readAll<MailboxIncomingEntry>(db, incomingStore)
  return entries.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
}
