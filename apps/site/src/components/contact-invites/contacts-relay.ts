import { isRecord } from './utils'
import type { ContactEntry } from './contacts-crdt'

export type ContactInviteAction = 'invite' | 'accept' | 'decline' | 'remove' | 'sync'

export type ContactInviteRelayEvent = {
  kind: 'contact-invite'
  action: ContactInviteAction
  status?: ContactEntry['status']
  inviteId: string
  fromUserId: string
  toUserId: string
  user: {
    id: string
    email: string
    name?: string | null
  }
  updatedAt: string
}

const normalizeAction = (value: unknown): ContactInviteAction | null => {
  if (value === 'invite' || value === 'accept' || value === 'decline' || value === 'remove' || value === 'sync') {
    return value
  }
  return null
}

const normalizeStatus = (value: unknown): ContactEntry['status'] | undefined => {
  if (value === 'incoming' || value === 'outgoing' || value === 'accepted' || value === 'declined' || value === 'removed') {
    return value
  }
  return undefined
}

export const parseContactInviteEvent = (payload: unknown): ContactInviteRelayEvent | null => {
  if (!isRecord(payload)) return null
  if (payload.kind !== 'contact-invite') return null
  const action = normalizeAction(payload.action)
  if (!action) return null
  const inviteId = typeof payload.inviteId === 'string' ? payload.inviteId : ''
  const fromUserId = typeof payload.fromUserId === 'string' ? payload.fromUserId : ''
  const toUserId = typeof payload.toUserId === 'string' ? payload.toUserId : ''
  const updatedAt = typeof payload.updatedAt === 'string' ? payload.updatedAt : ''
  const user = isRecord(payload.user) ? payload.user : null
  const userId = typeof user?.id === 'string' ? user.id : ''
  const email = typeof user?.email === 'string' && user.email.trim() ? user.email : userId
  if (!inviteId || !fromUserId || !toUserId || !updatedAt || !userId || !email) return null
  const status = action === 'sync' ? normalizeStatus(payload.status) : undefined
  if (action === 'sync' && !status) return null
  return {
    kind: 'contact-invite',
    action,
    status,
    inviteId,
    fromUserId,
    toUserId,
    user: {
      id: userId,
      email,
      name: typeof user?.name === 'string' ? user.name : user?.name === null ? null : undefined
    },
    updatedAt
  }
}

export const buildContactInviteEvent = (options: {
  action: ContactInviteAction
  status?: ContactEntry['status']
  inviteId: string
  fromUserId: string
  toUserId: string
  user: { id: string; email: string; name?: string | null }
  updatedAt?: string
}): ContactInviteRelayEvent => ({
  kind: 'contact-invite',
  action: options.action,
  status: options.status,
  inviteId: options.inviteId,
  fromUserId: options.fromUserId,
  toUserId: options.toUserId,
  user: {
    id: options.user.id,
    email: options.user.email?.trim() ? options.user.email : options.user.id,
    name: options.user.name ?? undefined
  },
  updatedAt: options.updatedAt ?? new Date().toISOString()
})

export const eventToContactEntry = (event: ContactInviteRelayEvent): ContactEntry | null => {
  let status: ContactEntry['status']
  if (event.action === 'sync' && event.status) {
    status = event.status
  } else if (event.action === 'invite') {
    status = 'incoming'
  } else if (event.action === 'accept') {
    status = 'accepted'
  } else if (event.action === 'decline' || event.action === 'remove') {
    status = 'removed'
  } else {
    return null
  }
  return {
    inviteId: event.inviteId,
    status,
    user: {
      id: event.user.id,
      name: event.user.name ?? undefined,
      email: event.user.email
    },
    updatedAt: event.updatedAt,
    source: 'relay'
  }
}
