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
    action: 'accept',
    inviteId: createMessageId(),
    fromUserId: normalized.id,
    toUserId: normalized.id,
    user: normalized,
    updatedAt: new Date().toISOString()
  }
}

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
      const hasName = (parsed.user.name ?? '').trim() !== ''
      const hasEmail = (parsed.user.email ?? '').trim() !== '' && parsed.user.email !== parsed.user.id
      if ((normalized.name && !hasName) || (normalized.email && !hasEmail && normalized.email !== normalized.id)) {
        const refreshed = encodeInviteToken(buildFriendCodeEvent(normalized))
        saveFriendCode(normalized.id, refreshed)
        return refreshed
      }
      return existing
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
