import { isRecord } from './utils'
import type { ContactInviteView, ContactInvitesPayload } from './types'

type CachedInvites = {
  payload: ContactInvitesPayload
  updatedAt: string
}

type CachedInvitesResult = {
  payload: ContactInvitesPayload
  updatedAt: string
  isExpired: boolean
}

const invitesCacheKey = (userId?: string) => `chat:invites:cache:${userId ?? 'anon'}`
const invitesCacheTtlMs = 1000 * 60 * 60 * 48

const parseUpdatedAt = (value: unknown) => {
  if (typeof value !== 'string') return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : value
}

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

export const loadInvitesCache = (
  userId?: string,
  options?: { allowStale?: boolean }
): CachedInvitesResult | null => {
  if (typeof window === 'undefined') return null
  try {
    const key = invitesCacheKey(userId)
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedInvites
    if (!parsed || !isRecord(parsed)) return null
    const updatedAt = parseUpdatedAt((parsed as CachedInvites).updatedAt)
    if (!updatedAt) return null
    const ageMs = Date.now() - Date.parse(updatedAt)
    const isExpired = !Number.isFinite(ageMs) || ageMs > invitesCacheTtlMs
    if (isExpired && !options?.allowStale) {
      window.localStorage.removeItem(key)
      return null
    }
    return {
      payload: normalizePayload((parsed as CachedInvites).payload ?? {}),
      updatedAt,
      isExpired
    }
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

export const clearInvitesCache = (userId?: string) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(invitesCacheKey(userId))
  } catch {
    // ignore storage failures
  }
}
