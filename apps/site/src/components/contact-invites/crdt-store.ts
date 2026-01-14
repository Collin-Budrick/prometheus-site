import * as Y from 'yjs'
import type { DeviceIdentity } from '../../shared/p2p-crypto'

type ContactStore = {
  doc: Y.Doc
  persistence: unknown
  ready: Promise<void>
}

const stores = new Map<string, ContactStore>()

const buildStoreKey = (contactId: string, identity: DeviceIdentity) =>
  `chat:p2p:crdt:${identity.deviceId}:${contactId}`

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
  const persistence = new IndexeddbPersistence(key, doc)
  const ready = persistence.whenSynced
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
  return { doc, meta, messages, outbox }
}
