import { isRecord } from './utils'
import type { ContactInviteView, ContactInvitesPayload } from './types'

type CachedInvites = {
  payload: ContactInvitesPayload
  updatedAt: string
}

const invitesCacheKey = (userId?: string) => `chat:invites:cache:${userId ?? 'anon'}`

const normalizeInvite = (value: unknown): ContactInviteView | null => {
  if (!isRecord(value)) return null
  const id = typeof value.id === 'string' ? value.id : ''
  const status = typeof value.status === 'string' ? value.status : ''
  const user = isRecord(value.user) ? value.user : null
  const userId = typeof user?.id === 'string' ? user.id : ''
  const email = typeof user?.email === 'string' ? user.email : ''
  if (!id || !status || !userId || !email) return null
  return {
    id,
    status,
    user: {
      id: userId,
      name: typeof user?.name === 'string' ? user.name : undefined,
      email
    }
  }
}

const normalizePayload = (payload: ContactInvitesPayload): ContactInvitesPayload => {
  const incoming = Array.isArray(payload.incoming)
    ? payload.incoming.map(normalizeInvite).filter(Boolean)
    : []
  const outgoing = Array.isArray(payload.outgoing)
    ? payload.outgoing.map(normalizeInvite).filter(Boolean)
    : []
  const contacts = Array.isArray(payload.contacts)
    ? payload.contacts.map(normalizeInvite).filter(Boolean)
    : []
  return {
    incoming: incoming as ContactInviteView[],
    outgoing: outgoing as ContactInviteView[],
    contacts: contacts as ContactInviteView[]
  }
}

export const loadInvitesCache = (userId?: string): ContactInvitesPayload | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(invitesCacheKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedInvites
    if (!parsed || !isRecord(parsed)) return null
    return normalizePayload((parsed as CachedInvites).payload ?? {})
  } catch {
    return null
  }
}

export const saveInvitesCache = (userId: string | undefined, payload: ContactInvitesPayload) => {
  if (typeof window === 'undefined' || !userId) return false
  try {
    const normalized = normalizePayload(payload)
    const entry: CachedInvites = {
      payload: normalized,
      updatedAt: new Date().toISOString()
    }
    window.localStorage.setItem(invitesCacheKey(userId), JSON.stringify(entry))
    return true
  } catch {
    return false
  }
}
