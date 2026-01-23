import type { AnyPgColumn, AnyPgTable } from 'drizzle-orm/pg-core'
import type { ValkeyClientType } from '@valkey/client'
import type { DatabaseClient } from '@platform/db'
import type { RateLimitResult } from '@platform/rate-limit'
import type { ValidateSessionHandler } from '@features/auth/server'

export type PushConfig = {
  vapidPublicKey?: string
  vapidPrivateKey?: string
  subject?: string
}

export type MessagingRouteOptions = {
  db: DatabaseClient['db']
  chatMessagesTable: ChatMessagesTable
  valkey: ValkeyClientType
  isValkeyReady: () => boolean
  validateSession?: ValidateSessionHandler
  usersTable?: UsersTable
  contactInvitesTable?: ContactInvitesTable
  getClientIp: (request: Request) => string
  checkRateLimit: (route: string, clientIp: string) => Promise<RateLimitResult>
  checkEarlyLimit: (key: string, max: number, windowMs: number) => Promise<{ allowed: boolean; remaining: number }>
  recordLatencySample: (metric: string, durationMs: number) => void | Promise<void>
  jsonError: (status: number, error: string, meta?: Record<string, unknown>) => Response
  maxChatHistory?: number
  push?: PushConfig
}

export type ChatMessagesTable = AnyPgTable & {
  createdAt: AnyPgColumn
  author?: AnyPgColumn
  body?: AnyPgColumn
}

export type UsersTable = AnyPgTable & {
  id: AnyPgColumn
  name: AnyPgColumn
  email: AnyPgColumn
}

export type ContactInvitesTable = AnyPgTable & {
  id: AnyPgColumn
  inviterId: AnyPgColumn
  inviteeId: AnyPgColumn
  status: AnyPgColumn
  createdAt?: AnyPgColumn
  updatedAt?: AnyPgColumn
}

export type ContactInviteStatus = 'pending' | 'accepted' | 'declined' | 'revoked'
export type ContactSearchStatus = 'none' | 'incoming' | 'outgoing' | 'accepted'

export type SessionUser = {
  id: string
  name?: string
  email?: string
}

export type ContactInviteView = {
  id: string
  status: ContactInviteStatus
  user: {
    id: string
    name?: string | null
    email: string
  }
}

export type P2pDeviceRole = 'device' | 'relay'

export type P2pDeviceEntry = {
  deviceId: string
  userId: string
  publicKey: Record<string, unknown>
  label?: string
  role: P2pDeviceRole
  relayPublicKey?: string
  relayUrls?: string[]
  createdAt: string
  updatedAt: string
}

export type P2pMailboxEnvelope = {
  id: string
  from: string
  to: string
  deviceId: string
  sessionId?: string
  payload: unknown
  createdAt: string
}

export type P2pPrekey = {
  keyId: number
  publicKey: string
}

export type P2pSignedPrekey = P2pPrekey & {
  signature: string
}

export type P2pPrekeyBundle = {
  deviceId: string
  userId: string
  registrationId: number
  identityKey: string
  signedPreKey: P2pSignedPrekey
  oneTimePreKeys?: P2pPrekey[]
  createdAt: string
  updatedAt: string
}

export type P2pPushSubscription = {
  deviceId: string
  userId: string
  subscription: {
    endpoint: string
    expirationTime?: number | null
    keys: {
      p256dh: string
      auth: string
    }
  }
  createdAt: string
  updatedAt: string
}

export type PushBroadcastOptions = {
  valkey: ValkeyClientType
  isValkeyReady: () => boolean
  push?: PushConfig
}
