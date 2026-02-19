import { describe, expect, it } from 'bun:test'
import {
  resolveApnsPushEnabled,
  resolveFcmPushEnabled,
  resolvePushEnabled,
  resolvePushSubscription,
  resolveWebPushEnabled
} from '../../features/messaging/src/api/push'
import { p2pPushSubscribeSchema, p2pPushUnsubscribeSchema } from '../../features/messaging/src/api/validators'

describe('push subscription schemas', () => {
  it('accepts web push subscription payloads', () => {
    const parsed = p2pPushSubscribeSchema.parse({
      channel: 'webpush',
      deviceId: 'device-12345678',
      subscription: {
        endpoint: 'https://push.example.com/subscription',
        keys: {
          p256dh: 'test-p256dh-value',
          auth: 'test-auth'
        }
      }
    })
    expect(parsed.channel).toBe('webpush')
  })

  it('accepts native push subscription payloads', () => {
    const parsed = p2pPushSubscribeSchema.parse({
      channel: 'native',
      deviceId: 'device-12345678',
      native: {
        platform: 'android',
        token: 'native-token-abcdefghijklmnopqrstuvwxyz',
        bundleId: 'com.prometheus.app'
      }
    })
    expect(parsed.channel).toBe('native')
    if (parsed.channel === 'native') {
      expect(parsed.native.platform).toBe('android')
    }
  })

  it('accepts native unsubscribe payloads', () => {
    const parsed = p2pPushUnsubscribeSchema.parse({
      channel: 'native',
      deviceId: 'device-12345678',
      platform: 'ios',
      token: 'ios-token-abcdefghijklmnopqrstuvwxyz'
    })
    expect(parsed.channel).toBe('native')
  })
})

describe('push subscription parsing', () => {
  it('parses web push records from legacy storage shape', () => {
    const parsed = resolvePushSubscription(
      JSON.stringify({
        deviceId: 'device-1',
        userId: 'user-1',
        subscription: {
          endpoint: 'https://push.example.com/subscription',
          keys: {
            p256dh: 'test-p256dh-value',
            auth: 'test-auth'
          }
        }
      })
    )

    expect(parsed?.channel).toBe('webpush')
    if (parsed?.channel === 'webpush') {
      expect(parsed.webpush.endpoint).toContain('push.example.com')
    }
  })

  it('parses native push records', () => {
    const parsed = resolvePushSubscription(
      JSON.stringify({
        channel: 'native',
        deviceId: 'device-1',
        userId: 'user-1',
        native: {
          platform: 'ios',
          token: 'ios-token-abcdefghijklmnopqrstuvwxyz',
          bundleId: 'com.prometheus.app'
        }
      })
    )
    expect(parsed?.channel).toBe('native')
    if (parsed?.channel === 'native') {
      expect(parsed.native.platform).toBe('ios')
    }
  })
})

describe('push provider enablement', () => {
  it('resolves web push enablement from VAPID keys', () => {
    expect(
      resolveWebPushEnabled({
        vapidPublicKey: 'public',
        vapidPrivateKey: 'private',
        subject: 'mailto:push@prometheus.dev'
      })
    ).toBe(true)
  })

  it('resolves FCM and APNs enablement from provider credentials', () => {
    expect(
      resolveFcmPushEnabled({
        fcmProjectId: 'project-id',
        fcmClientEmail: 'firebase-admin@project-id.iam.gserviceaccount.com',
        fcmPrivateKey: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----'
      })
    ).toBe(true)

    expect(
      resolveApnsPushEnabled({
        apnsKeyId: 'ABCD1234',
        apnsTeamId: 'TEAM123456',
        apnsPrivateKey: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----'
      })
    ).toBe(true)
  })

  it('resolves push enabled when any provider is configured', () => {
    expect(
      resolvePushEnabled({
        fcmProjectId: 'project-id',
        fcmClientEmail: 'firebase-admin@project-id.iam.gserviceaccount.com',
        fcmPrivateKey: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----'
      })
    ).toBe(true)
  })
})
