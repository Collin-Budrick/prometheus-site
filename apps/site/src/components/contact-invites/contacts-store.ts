import type { ContactInviteView } from './types'

export const defaultPresenceTtlMs = 45_000

export type ContactPresence = {
  lastSeenAt: string
}

export type ContactInviteState = {
  inviteId: string
  status: ContactInviteView['status']
  updatedAt: string
}

export type LocalContactEntry = {
  id: string
  email: string
  name?: string | null
  invite?: ContactInviteState
  presence?: ContactPresence
}

export type ContactsStoreSnapshot = {
  version: 1
  updatedAt: string
  contacts: Record<string, LocalContactEntry>
}

const contactsStoreVersion = 1

const storageKey = (userId: string) => `contact-invites:store:${encodeURIComponent(userId)}`

const emptySnapshot = (): ContactsStoreSnapshot => ({
  version: contactsStoreVersion,
  updatedAt: new Date().toISOString(),
  contacts: {}
})

const parseSnapshot = (value: string | null): ContactsStoreSnapshot => {
  if (!value) return emptySnapshot()
  try {
    const parsed = JSON.parse(value) as Partial<ContactsStoreSnapshot>
    if (!parsed || parsed.version !== contactsStoreVersion || typeof parsed !== 'object') {
      return emptySnapshot()
    }
    const contacts = parsed.contacts
    if (!contacts || typeof contacts !== 'object') return emptySnapshot()
    return {
      version: contactsStoreVersion,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      contacts: contacts as Record<string, LocalContactEntry>
    }
  } catch {
    return emptySnapshot()
  }
}

export const loadContactsStore = (userId?: string): ContactsStoreSnapshot => {
  if (!userId || typeof window === 'undefined') return emptySnapshot()
  return parseSnapshot(window.localStorage.getItem(storageKey(userId)))
}

export const saveContactsStore = (userId: string, snapshot: ContactsStoreSnapshot) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(snapshot))
  } catch {
    // ignore storage failures
  }
}

export const syncContactsStoreFromPayload = (userId: string, payload: ContactInviteView[]) => {
  const snapshot = loadContactsStore(userId)
  const nextContacts: Record<string, LocalContactEntry> = {}
  const now = new Date().toISOString()

  payload.forEach((entry) => {
    const previous = snapshot.contacts[entry.user.id]
    const nextName = entry.user.name !== undefined ? entry.user.name : previous?.name
    nextContacts[entry.user.id] = {
      id: entry.user.id,
      email: entry.user.email,
      name: nextName,
      invite: {
        inviteId: entry.id,
        status: entry.status,
        updatedAt: now
      },
      presence: previous?.presence
    }
  })

  const nextSnapshot: ContactsStoreSnapshot = {
    version: contactsStoreVersion,
    updatedAt: now,
    contacts: nextContacts
  }
  saveContactsStore(userId, nextSnapshot)
  return nextSnapshot
}

export const syncContactsStoreFromInvitesPayload = (
  userId: string,
  payload: { incoming?: ContactInviteView[]; outgoing?: ContactInviteView[]; contacts?: ContactInviteView[] }
) => {
  const entries = [...(payload.incoming ?? []), ...(payload.outgoing ?? []), ...(payload.contacts ?? [])]
  return syncContactsStoreFromPayload(userId, entries)
}

export const updateContactPresence = (userId: string, contactId: string, presence: ContactPresence) => {
  const snapshot = loadContactsStore(userId)
  const existing = snapshot.contacts[contactId]
  const nextEntry: LocalContactEntry = {
    id: contactId,
    email: existing?.email ?? contactId,
    name: existing?.name,
    invite: existing?.invite,
    presence
  }
  const nextSnapshot: ContactsStoreSnapshot = {
    version: contactsStoreVersion,
    updatedAt: new Date().toISOString(),
    contacts: {
      ...snapshot.contacts,
      [contactId]: nextEntry
    }
  }
  saveContactsStore(userId, nextSnapshot)
  return nextSnapshot
}

export const resolveOnlineContactIds = (
  snapshot: ContactsStoreSnapshot,
  contactIds: string[],
  ttlMs: number,
  now = Date.now()
) =>
  contactIds.filter((id) => {
    const entry = snapshot.contacts[id]
    if (!entry?.presence?.lastSeenAt) return false
    const lastSeen = Date.parse(entry.presence.lastSeenAt)
    if (!Number.isFinite(lastSeen)) return false
    return now - lastSeen <= ttlMs
  })
