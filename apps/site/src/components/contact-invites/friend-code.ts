import type { ContactInviteRelayEvent } from './contacts-relay'
import { decodeInviteToken, encodeInviteToken } from './invite-token'
import { createMessageId } from './utils'

const friendCodeStoragePrefix = 'chat:friend-code:'

const buildFriendCodeKey = (userId?: string) =>
  `${friendCodeStoragePrefix}${userId ? encodeURIComponent(userId) : 'default'}`

const normalizeUser = (user: { id: string; email?: string | null; name?: string | null }) => {
  const email = user.email?.trim() ? user.email.trim() : user.id
  const name = user.name?.trim() ? user.name.trim() : undefined
  return {
    id: user.id,
    email,
    name
  }
}

const buildFriendCodeEvent = (user: { id: string; email?: string | null; name?: string | null }): ContactInviteRelayEvent => {
  const normalized = normalizeUser(user)
  return {
    kind: 'contact-invite',
    action: 'invite',
    inviteId: createMessageId(),
    fromUserId: normalized.id,
    toUserId: normalized.id,
    user: normalized,
    updatedAt: new Date().toISOString()
  }
}

const isFriendCodeEvent = (event: ContactInviteRelayEvent) =>
  event.fromUserId === event.toUserId && event.user.id === event.fromUserId

export const loadFriendCode = (userId?: string) => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(buildFriendCodeKey(userId))
    return raw && raw.trim() ? raw : null
  } catch {
    return null
  }
}

export const saveFriendCode = (userId: string | undefined, code: string) => {
  if (typeof window === 'undefined') return
  if (!code) return
  try {
    window.localStorage.setItem(buildFriendCodeKey(userId), code)
  } catch {
    // ignore storage failures
  }
}

export const ensureFriendCode = (user: { id: string; email?: string | null; name?: string | null }) => {
  const existing = loadFriendCode(user.id)
  const normalized = normalizeUser(user)
  if (existing) {
    const parsed = decodeInviteToken(existing)
    if (parsed?.user?.id === normalized.id) {
      const existingName = (parsed.user.name ?? '').trim()
      const existingEmail = (parsed.user.email ?? '').trim()
      const nextName = (normalized.name ?? '').trim()
      const nextEmail = (normalized.email ?? '').trim()
      if (existingName === nextName && existingEmail === nextEmail) {
        return existing
      }
    }
  }
  const code = encodeInviteToken(buildFriendCodeEvent(normalized))
  saveFriendCode(normalized.id, code)
  return code
}

export const rotateFriendCode = (user: { id: string; email?: string | null; name?: string | null }) => {
  const normalized = normalizeUser(user)
  const code = encodeInviteToken(buildFriendCodeEvent(normalized))
  saveFriendCode(normalized.id, code)
  return code
}

export const parseFriendCodeToken = (token: string) => {
  const parsed = decodeInviteToken(token)
  if (!parsed) return null
  if (!isFriendCodeEvent(parsed)) return null
  return parsed
}

export const getFriendCodeInviteId = (userId?: string) => {
  const token = loadFriendCode(userId)
  if (!token) return null
  const parsed = decodeInviteToken(token)
  if (!parsed || !isFriendCodeEvent(parsed)) return null
  return parsed.inviteId
}

export const isCurrentFriendCodeInvite = (userId: string, inviteId: string) => {
  const current = getFriendCodeInviteId(userId)
  if (!current) return true
  return current === inviteId
}
