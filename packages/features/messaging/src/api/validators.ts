import { z } from 'zod'
import { p2pMailboxTtlSeconds } from './constants'

export const inviteByEmailSchema = z.object({
  email: z.string().email()
})

export const searchEmailSchema = z.object({
  email: z.string().min(3)
})

export const p2pDeviceSchema = z.object({
  deviceId: z.string().min(8).optional(),
  publicKey: z.record(z.string(), z.unknown()),
  label: z.string().min(1).max(64).optional(),
  role: z.enum(['device', 'relay']).optional(),
  relayPublicKey: z.string().min(16).optional(),
  relayUrls: z.array(z.string().min(6)).max(16).optional()
})

export const p2pPrekeySchema = z.object({
  deviceId: z.string().min(8),
  registrationId: z.number().int().positive(),
  identityKey: z.string().min(8),
  signedPreKey: z.object({
    keyId: z.number().int().nonnegative(),
    publicKey: z.string().min(8),
    signature: z.string().min(8)
  }),
  oneTimePreKeys: z
    .array(
      z.object({
        keyId: z.number().int().nonnegative(),
        publicKey: z.string().min(8)
      })
    )
    .max(50)
    .optional()
})

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(10),
    auth: z.string().min(6)
  })
})

export const p2pPushSubscribeSchema = z.object({
  deviceId: z.string().min(8),
  subscription: pushSubscriptionSchema
})

export const p2pPushUnsubscribeSchema = z.object({
  deviceId: z.string().min(8)
})

export const p2pMailboxSendSchema = z.object({
  recipientId: z.string().min(6),
  messageId: z.string().min(8).optional(),
  sessionId: z.string().min(8).optional(),
  senderDeviceId: z.string().min(8).optional(),
  deviceIds: z.array(z.string().min(8)).optional(),
  payload: z.unknown(),
  ttlSeconds: z.number().int().positive().max(p2pMailboxTtlSeconds).optional()
})

export const p2pMailboxPullSchema = z.object({
  deviceId: z.string().min(8),
  limit: z.number().int().min(1).max(100).optional()
})

export const p2pMailboxAckSchema = z.object({
  deviceId: z.string().min(8),
  messageIds: z.array(z.string().min(8)).min(1).max(200)
})
