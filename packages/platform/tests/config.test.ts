import { describe, expect, it } from 'bun:test'
import { loadPlatformConfig as loadConfig } from '@platform/config'

describe('configuration validation', () => {
  it('builds defaults when env vars are absent', () => {
    const cfg = loadConfig({})

    expect(cfg.postgres.connectionString).toBe(
      'postgresql://prometheus:secret@localhost:5433/prometheus'
    )
    expect(cfg.postgres.ssl).toBe(false)
    expect(cfg.postgres.connectRetries).toBe(5)
    expect(cfg.postgres.backoffMs).toBe(200)

    expect(cfg.valkey.host).toBe('localhost')
    expect(cfg.valkey.port).toBe(6379)

    expect(cfg.rateLimit.unkey.rootKey).toBeUndefined()
    expect(cfg.rateLimit.unkey.namespace).toBe('prometheus-api')
    expect(cfg.rateLimit.unkey.baseUrl).toBe('https://api.unkey.com')

    expect(cfg.push.vapidPublicKey).toBeUndefined()
    expect(cfg.push.fcmProjectId).toBeUndefined()
    expect(cfg.push.apnsKeyId).toBeUndefined()
    expect(cfg.push.apnsUseSandbox).toBe(false)
  })

  it('uses custom values when provided', () => {
    const cfg = loadConfig({
      POSTGRES_USER: 'app',
      POSTGRES_PASSWORD: 'pw',
      POSTGRES_HOST: 'db.internal',
      POSTGRES_PORT: '6543',
      POSTGRES_DB: 'appdb',
      POSTGRES_SSL: 'true',
      DB_CONNECT_RETRIES: '2',
      DB_CONNECT_BACKOFF_MS: '400',
      VALKEY_HOST: 'cache.internal',
      VALKEY_PORT: '6380',
      UNKEY_ROOT_KEY: 'unkey_root_123',
      UNKEY_RATELIMIT_NAMESPACE: 'api',
      UNKEY_RATELIMIT_BASE_URL: 'https://unkey.example.com',
      PUSH_VAPID_PUBLIC_KEY: 'vapid-public',
      PUSH_VAPID_PRIVATE_KEY: 'vapid-private',
      PUSH_VAPID_SUBJECT: 'mailto:notifications@prometheus.dev',
      PUSH_FCM_PROJECT_ID: 'prometheus-prod',
      PUSH_FCM_CLIENT_EMAIL: 'firebase-adminsdk@example.iam.gserviceaccount.com',
      PUSH_FCM_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----',
      PUSH_APNS_KEY_ID: 'ABCD1234',
      PUSH_APNS_TEAM_ID: 'TEAM123456',
      PUSH_APNS_BUNDLE_ID: 'com.prometheus.app',
      PUSH_APNS_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----',
      PUSH_APNS_USE_SANDBOX: 'true'
    })

    expect(cfg.postgres.connectionString).toBe(
      'postgresql://app:pw@db.internal:6543/appdb'
    )
    expect(cfg.postgres.ssl).toBe('require')
    expect(cfg.postgres.connectRetries).toBe(2)
    expect(cfg.postgres.backoffMs).toBe(400)

    expect(cfg.valkey.host).toBe('cache.internal')
    expect(cfg.valkey.port).toBe(6380)

    expect(cfg.rateLimit.unkey.rootKey).toBe('unkey_root_123')
    expect(cfg.rateLimit.unkey.namespace).toBe('api')
    expect(cfg.rateLimit.unkey.baseUrl).toBe('https://unkey.example.com')

    expect(cfg.push.vapidPublicKey).toBe('vapid-public')
    expect(cfg.push.vapidPrivateKey).toBe('vapid-private')
    expect(cfg.push.subject).toBe('mailto:notifications@prometheus.dev')
    expect(cfg.push.fcmProjectId).toBe('prometheus-prod')
    expect(cfg.push.fcmClientEmail).toBe('firebase-adminsdk@example.iam.gserviceaccount.com')
    expect(cfg.push.fcmPrivateKey).toBe('-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----')
    expect(cfg.push.apnsKeyId).toBe('ABCD1234')
    expect(cfg.push.apnsTeamId).toBe('TEAM123456')
    expect(cfg.push.apnsBundleId).toBe('com.prometheus.app')
    expect(cfg.push.apnsPrivateKey).toBe('-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----')
    expect(cfg.push.apnsUseSandbox).toBe(true)
  })

  it('rejects invalid numeric values', () => {
    expect(() => loadConfig({ POSTGRES_PORT: 'abc' })).toThrow(/POSTGRES_PORT/)
    expect(() => loadConfig({ VALKEY_PORT: '-1' })).toThrow(/VALKEY_PORT/)
    expect(() => loadConfig({ DB_CONNECT_RETRIES: '-5' })).toThrow(/DB_CONNECT_RETRIES/)
    expect(() => loadConfig({ DB_CONNECT_BACKOFF_MS: '1.5' })).toThrow(/DB_CONNECT_BACKOFF_MS/)
  })

  it('rejects invalid booleans and URLs', () => {
    expect(() => loadConfig({ POSTGRES_SSL: 'maybe' })).toThrow(/POSTGRES_SSL/)
    expect(() => loadConfig({ DATABASE_URL: 'not-a-url' })).toThrow(/DATABASE_URL/)
    expect(() => loadConfig({ PUSH_APNS_USE_SANDBOX: 'maybe' })).toThrow(/PUSH_APNS_USE_SANDBOX/)
  })
})
