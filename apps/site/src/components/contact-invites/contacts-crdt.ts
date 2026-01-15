import * as Y from 'yjs'
import type { ContactInviteView, ContactInvitesPayload } from './types'
import { loadInvitesCache } from './invites-cache'
import { isRecord } from './utils'

type ContactsStore = {
  doc: Y.Doc
  persistence: unknown
  ready: Promise<void>
}

export type ContactEntry = {
  inviteId: string
  status: 'incoming' | 'outgoing' | 'accepted' | 'declined' | 'removed'
  user: {
    id: string
    name?: string | null
    email: string
  }
  updatedAt: string
  createdAt?: string
  source?: 'local' | 'relay' | 'server'
}

type ContactMaps = {
  doc: Y.Doc
  meta: Y.Map<unknown>
  contacts: Y.Map<unknown>
}

const stores = new Map<string, ContactsStore>()
const storePrefix = 'chat:contacts:crdt'
const migratedKey = 'legacyInvitesMigrated'

const buildStoreKey = (userId: string) => `${storePrefix}:${userId}`

const parseTimestamp = (value: string | undefined) => {
  if (!value) return Number.NaN
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? Number.NaN : parsed
}

const isNewer = (current: ContactEntry | null, next: ContactEntry) => {
  if (!current) return true
  const currentTime = parseTimestamp(current.updatedAt)
  const nextTime = parseTimestamp(next.updatedAt)
  if (!Number.isFinite(currentTime) && Number.isFinite(nextTime)) return true
  if (Number.isFinite(currentTime) && !Number.isFinite(nextTime)) return false
  if (!Number.isFinite(currentTime) && !Number.isFinite(nextTime)) return true
  return nextTime >= currentTime
}

const normalizeContactEntry = (value: unknown): ContactEntry | null => {
  if (!isRecord(value)) return null
  const inviteId = typeof value.inviteId === 'string' ? value.inviteId : ''
  const statusRaw = typeof value.status === 'string' ? value.status : ''
  const status =
    statusRaw === 'incoming' || statusRaw === 'outgoing' || statusRaw === 'accepted'
      ? statusRaw
      : statusRaw === 'declined' || statusRaw === 'removed'
        ? statusRaw
        : ''
  const user = isRecord(value.user) ? value.user : null
  const userId = typeof user?.id === 'string' ? user.id : ''
  const email = typeof user?.email === 'string' ? user.email : ''
  const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : ''
  if (!inviteId || !status || !userId || !email || !updatedAt) return null
  return {
    inviteId,
    status,
    user: {
      id: userId,
      name: typeof user?.name === 'string' ? user.name : user?.name === null ? null : undefined,
      email
    },
    updatedAt,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : undefined,
    source: value.source === 'relay' || value.source === 'server' || value.source === 'local' ? value.source : undefined
  }
}

const ensureStore = async (userId: string) => {
  if (typeof window === 'undefined') return null
  const trimmed = userId.trim()
  if (!trimmed) return null
  const key = buildStoreKey(trimmed)
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
  stores.set(key, { doc, persistence, ready })
  await ready
  return doc
}

export const applyContactEntry = (contacts: Y.Map<unknown>, entry: ContactEntry) => {
  if (!entry.inviteId || !entry.user.id || !entry.user.email || !entry.updatedAt) return false
  const existing = normalizeContactEntry(contacts.get(entry.user.id))
  if (!isNewer(existing, entry)) return false
  contacts.set(entry.user.id, entry)
  return true
}

const migrateLegacyInvites = (maps: ContactMaps, userId: string) => {
  if (typeof window === 'undefined') return
  if (maps.meta.get(migratedKey)) return
  const cached = loadInvitesCache(userId, { allowStale: true })
  if (!cached) {
    maps.meta.set(migratedKey, new Date().toISOString())
    return
  }
  const now = new Date().toISOString()
  const applyInvite = (invite: ContactInviteView, status: ContactEntry['status']) => {
    const entry: ContactEntry = {
      inviteId: invite.id,
      status,
      user: {
        id: invite.user.id,
        name: invite.user.name ?? undefined,
        email: invite.user.email
      },
      updatedAt: now,
      source: 'server'
    }
    applyContactEntry(maps.contacts, entry)
  }
  maps.doc.transact(() => {
    cached.payload.incoming?.forEach((invite) => applyInvite(invite, 'incoming'))
    cached.payload.outgoing?.forEach((invite) => applyInvite(invite, 'outgoing'))
    cached.payload.contacts?.forEach((invite) => applyInvite(invite, 'accepted'))
    maps.meta.set(migratedKey, new Date().toISOString())
  })
}

export const loadContactsMaps = async (userId: string): Promise<ContactMaps | null> => {
  const doc = await ensureStore(userId)
  if (!doc) return null
  const meta = doc.getMap<unknown>('meta')
  const contacts = doc.getMap<unknown>('contacts')
  migrateLegacyInvites({ doc, meta, contacts }, userId)
  return { doc, meta, contacts }
}

export const observeContacts = (contacts: Y.Map<unknown>, callback: () => void) => {
  const handler = () => callback()
  contacts.observe(handler)
  return () => contacts.unobserve(handler)
}

export const serializeContactsPayload = (contacts: Y.Map<unknown>): ContactInvitesPayload => {
  const incoming: ContactInviteView[] = []
  const outgoing: ContactInviteView[] = []
  const accepted: ContactInviteView[] = []
  contacts.forEach((value) => {
    const entry = normalizeContactEntry(value)
    if (!entry) return
    const invite: ContactInviteView = {
      id: entry.inviteId,
      status: entry.status,
      user: {
        id: entry.user.id,
        name: entry.user.name ?? undefined,
        email: entry.user.email
      }
    }
    if (entry.status === 'incoming') incoming.push(invite)
    if (entry.status === 'outgoing') outgoing.push(invite)
    if (entry.status === 'accepted') accepted.push(invite)
  })
  return { incoming, outgoing, contacts: accepted }
}

export const readContactEntry = (contacts: Y.Map<unknown>, userId: string) =>
  normalizeContactEntry(contacts.get(userId))

export const mergeContactsPayload = (
  contacts: Y.Map<unknown>,
  payload: ContactInvitesPayload,
  source: ContactEntry['source']
) => {
  const now = new Date().toISOString()
  const apply = (invite: ContactInviteView, status: ContactEntry['status']) => {
    const existing = normalizeContactEntry(contacts.get(invite.user.id))
    if (existing && existing.source && existing.source !== 'server') return
    const entry: ContactEntry = {
      inviteId: invite.id,
      status,
      user: {
        id: invite.user.id,
        name: invite.user.name ?? undefined,
        email: invite.user.email
      },
      updatedAt: now,
      source
    }
    applyContactEntry(contacts, entry)
  }
  payload.incoming?.forEach((invite) => apply(invite, 'incoming'))
  payload.outgoing?.forEach((invite) => apply(invite, 'outgoing'))
  payload.contacts?.forEach((invite) => apply(invite, 'accepted'))
}
