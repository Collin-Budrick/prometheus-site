import * as Y from 'yjs'
import { randomBase64 } from '../../shared/p2p-crypto'
import type { DeviceIdentity } from '../../shared/p2p-crypto'

type ContactStore = {
  doc: Y.Doc
  persistence: unknown
  ready: Promise<void>
}

type LegacyImage = {
  dataUrl: string
  name?: string
  mime?: string
  width?: number
  height?: number
  size?: number
}

type LegacyHistoryEntry = {
  id: string
  text: string
  author: 'self' | 'contact'
  createdAt: string
  status?: 'sent' | 'read'
  kind: 'text' | 'image'
  image?: LegacyImage
}

type LegacyOutboxEntry = {
  id: string
  kind: 'text' | 'image'
  createdAt: string
  text?: string
  payloadBase64?: string
  encoding?: 'zstd'
  name?: string
  mime?: string
  size?: number
  width?: number
  height?: number
  sentAt?: string
  attempts?: number
  sentVia?: 'relay' | 'channel'
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const stores = new Map<string, ContactStore>()

const buildStoreKey = (contactId: string, identity: DeviceIdentity) =>
  `chat:p2p:crdt:${identity.deviceId}:${contactId}`

const legacyHistoryKeys = (contactId: string) => [
  `chat:p2p:history:${contactId}`,
  `chat:p2p:dm:history:${contactId}`,
  `chat:p2p:history:${contactId}:messages`
]

const legacyOutboxKeys = (contactId: string) => [
  `chat:p2p:outbox:${contactId}`,
  `chat:p2p:dm:outbox:${contactId}`,
  `chat:p2p:outbox:${contactId}:items`
]

const replicationKeyField = 'replicationKey'

const readLegacyArray = (keys: string[], matcher: (key: string) => boolean) => {
  if (typeof window === 'undefined') return null
  for (const key of keys) {
    const raw = window.localStorage.getItem(key)
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return { key, entries: parsed }
    } catch {
      // ignore invalid data
    }
  }
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i)
    if (!key || !matcher(key)) continue
    const raw = window.localStorage.getItem(key)
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return { key, entries: parsed }
    } catch {
      // ignore invalid data
    }
  }
  return null
}

const normalizeLegacyImage = (value: unknown) => {
  if (!isRecord(value)) return undefined
  const dataUrl = typeof value.dataUrl === 'string' ? value.dataUrl : ''
  if (!dataUrl) return undefined
  const name = typeof value.name === 'string' ? value.name : undefined
  const mime = typeof value.mime === 'string' ? value.mime : undefined
  const width = typeof value.width === 'number' ? value.width : undefined
  const height = typeof value.height === 'number' ? value.height : undefined
  const size = typeof value.size === 'number' ? value.size : undefined
  return { dataUrl, name, mime, width, height, size }
}

const normalizeLegacyHistory = (entries: unknown[]) =>
  entries
    .map((entry): LegacyHistoryEntry | null => {
      if (!isRecord(entry)) return null
      const id = typeof entry.id === 'string' ? entry.id : ''
      const author = entry.author === 'self' || entry.author === 'contact' ? entry.author : null
      const createdAt = typeof entry.createdAt === 'string' ? entry.createdAt : ''
      if (!id || !author || !createdAt) return null
      const text = typeof entry.text === 'string' ? entry.text : ''
      const status = entry.status === 'sent' || entry.status === 'read' ? entry.status : undefined
      const image = normalizeLegacyImage(entry.image)
      const kind = entry.kind === 'image' || image ? 'image' : 'text'
      if (!text.trim() && !image) return null
      return { id, text, author, createdAt, status, kind, image }
    })
    .filter((entry): entry is LegacyHistoryEntry => Boolean(entry))

const normalizeLegacyOutbox = (entries: unknown[]) =>
  entries
    .map((entry): LegacyOutboxEntry | null => {
      if (!isRecord(entry)) return null
      const id = typeof entry.id === 'string' ? entry.id : ''
      const createdAt = typeof entry.createdAt === 'string' ? entry.createdAt : ''
      const kind = entry.kind === 'image' ? 'image' : 'text'
      if (!id || !createdAt) return null
      if (kind === 'text') {
        const text = typeof entry.text === 'string' ? entry.text : ''
        if (!text.trim()) return null
        return {
          id,
          kind,
          createdAt,
          text,
          sentAt: typeof entry.sentAt === 'string' ? entry.sentAt : undefined,
          attempts: typeof entry.attempts === 'number' ? entry.attempts : undefined,
          sentVia: entry.sentVia === 'relay' || entry.sentVia === 'channel' ? entry.sentVia : undefined
        }
      }
      const payloadBase64 = typeof entry.payloadBase64 === 'string' ? entry.payloadBase64 : ''
      if (!payloadBase64) return null
      return {
        id,
        kind,
        createdAt,
        payloadBase64,
        encoding: entry.encoding === 'zstd' ? 'zstd' : undefined,
        name: typeof entry.name === 'string' ? entry.name : undefined,
        mime: typeof entry.mime === 'string' ? entry.mime : undefined,
        size: typeof entry.size === 'number' ? entry.size : undefined,
        width: typeof entry.width === 'number' ? entry.width : undefined,
        height: typeof entry.height === 'number' ? entry.height : undefined,
        sentAt: typeof entry.sentAt === 'string' ? entry.sentAt : undefined,
        attempts: typeof entry.attempts === 'number' ? entry.attempts : undefined,
        sentVia: entry.sentVia === 'relay' || entry.sentVia === 'channel' ? entry.sentVia : undefined
      }
    })
    .filter((entry): entry is LegacyOutboxEntry => Boolean(entry))

const ensureStore = async (contactId: string, identity: DeviceIdentity) => {
  if (typeof window === 'undefined') return null
  const key = buildStoreKey(contactId, identity)
  const existing = stores.get(key)
  if (existing) {
    await existing.ready
    return existing.doc
  }
  const doc = new Y.Doc()
  const { IndexeddbPersistence } = await import('y-indexeddb')
  type IndexedDoc = ConstructorParameters<typeof IndexeddbPersistence>[1]
  const persistence = new IndexeddbPersistence(key, doc as unknown as IndexedDoc)
  const ready = persistence.whenSynced.then(() => {})
  const store: ContactStore = { doc, persistence, ready }
  stores.set(key, store)
  await ready
  return doc
}

export const loadContactMaps = async (contactId: string, identity: DeviceIdentity) => {
  const doc = await ensureStore(contactId, identity)
  if (!doc) return null
  const meta = doc.getMap<unknown>('meta')
  const messages = doc.getMap<unknown>('messages')
  const outbox = doc.getMap<unknown>('outbox')
  if (typeof window !== 'undefined' && !meta.get('legacyMigrated')) {
    const historyMatch = readLegacyArray(legacyHistoryKeys(contactId), (key) =>
      key.includes(contactId) && key.includes('history')
    )
    const outboxMatch = readLegacyArray(legacyOutboxKeys(contactId), (key) =>
      key.includes(contactId) && key.includes('outbox')
    )
    const historyEntries = historyMatch ? normalizeLegacyHistory(historyMatch.entries) : []
    const outboxEntries = outboxMatch ? normalizeLegacyOutbox(outboxMatch.entries) : []
    if (historyEntries.length || outboxEntries.length) {
      doc.transact(() => {
        historyEntries.forEach((entry) => {
          const id = typeof entry.id === 'string' ? entry.id : ''
          if (id) messages.set(id, entry)
        })
        outboxEntries.forEach((entry) => {
          const id = typeof entry.id === 'string' ? entry.id : ''
          if (id) outbox.set(id, entry)
        })
        meta.set('legacyMigrated', new Date().toISOString())
      })
      if (historyMatch?.key) window.localStorage.removeItem(historyMatch.key)
      if (outboxMatch?.key) window.localStorage.removeItem(outboxMatch.key)
    } else {
      meta.set('legacyMigrated', new Date().toISOString())
    }
  }
  return { doc, meta, messages, outbox }
}

export const loadReplicationKey = async (contactId: string, identity: DeviceIdentity) => {
  const maps = await loadContactMaps(contactId, identity)
  if (!maps) return null
  const value = maps.meta.get(replicationKeyField)
  return typeof value === 'string' && value.trim() ? value : null
}

export const setReplicationKey = async (contactId: string, identity: DeviceIdentity, key: string) => {
  const maps = await loadContactMaps(contactId, identity)
  if (!maps) return false
  const trimmed = key.trim()
  if (!trimmed) return false
  maps.doc.transact(() => {
    maps.meta.set(replicationKeyField, trimmed)
  })
  return true
}

export const ensureReplicationKey = async (
  contactId: string,
  identity: DeviceIdentity,
  options?: { generate?: boolean }
) => {
  const existing = await loadReplicationKey(contactId, identity)
  if (existing) return existing
  if (!options?.generate) return null
  const next = randomBase64(32)
  const saved = await setReplicationKey(contactId, identity, next)
  return saved ? next : null
}
