import type { ContactInviteRelayEvent } from './contacts-relay'
import { encodeInviteToken } from './invite-token'
import { createMessageId } from './utils'

const friendCodeStoragePrefix = 'chat:friend-code:'

const buildFriendCodeKey = (userId?: string) =>
  `${friendCodeStoragePrefix}${userId ? encodeURIComponent(userId) : 'default'}`

const normalizeUser = (user: { id: string; email?: string | null; name?: string | null }) => ({
  id: user.id,
  email: user.email?.trim() ? user.email : user.id,
  name: user.name ?? undefined
})

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
  if (existing) return existing
  const code = encodeInviteToken(buildFriendCodeEvent(user))
  saveFriendCode(user.id, code)
  return code
}

export const rotateFriendCode = (user: { id: string; email?: string | null; name?: string | null }) => {
  const code = encodeInviteToken(buildFriendCodeEvent(user))
  saveFriendCode(user.id, code)
  return code
}
