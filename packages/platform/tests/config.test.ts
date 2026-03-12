import { describe, expect, it } from 'bun:test'
import { loadPlatformConfig as loadConfig } from '@platform/config'

describe('configuration validation', () => {
  it('builds defaults when env vars are absent', () => {
    const cfg = loadConfig({})

    expect(cfg.spacetime.uri).toBe('http://127.0.0.1:3000/')
    expect(cfg.spacetime.moduleName).toBe('prometheus-site-local')
    expect(cfg.spacetime.connectRetries).toBe(5)
    expect(cfg.spacetime.backoffMs).toBe(200)

    expect(cfg.garnet.host).toBe('localhost')
    expect(cfg.garnet.port).toBe(6379)

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
      SPACETIMEDB_URI: 'https://db.prometheus.dev/',
      SPACETIMEDB_MODULE: 'prometheus-prod',
      DB_CONNECT_RETRIES: '2',
      DB_CONNECT_BACKOFF_MS: '400',
      GARNET_HOST: 'cache.internal',
      GARNET_PORT: '6380',
      SPACETIMEAUTH_AUTHORITY: 'https://auth.prometheus.dev/oidc',
      SPACETIMEAUTH_CLIENT_ID: 'prometheus-web',
      SPACETIMEAUTH_JWKS_URI: 'https://auth.prometheus.dev/oidc/jwks',
      SPACETIMEAUTH_POST_LOGOUT_REDIRECT_URI: 'https://prometheus.dev/login',
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

    expect(cfg.spacetime.uri).toBe('https://db.prometheus.dev/')
    expect(cfg.spacetime.moduleName).toBe('prometheus-prod')
    expect(cfg.spacetime.connectRetries).toBe(2)
    expect(cfg.spacetime.backoffMs).toBe(400)

    expect(cfg.garnet.host).toBe('cache.internal')
    expect(cfg.garnet.port).toBe(6380)

    expect(cfg.auth.spacetimeAuth.authority).toBe('https://auth.prometheus.dev/oidc')
    expect(cfg.auth.spacetimeAuth.clientId).toBe('prometheus-web')
    expect(cfg.auth.spacetimeAuth.jwksUri).toBe('https://auth.prometheus.dev/oidc/jwks')
    expect(cfg.auth.spacetimeAuth.postLogoutRedirectUri).toBe('https://prometheus.dev/login')

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
    expect(() => loadConfig({ GARNET_PORT: '-1' })).toThrow(/GARNET_PORT/)
    expect(() => loadConfig({ DB_CONNECT_RETRIES: '-5' })).toThrow(/DB_CONNECT_RETRIES/)
    expect(() => loadConfig({ DB_CONNECT_BACKOFF_MS: '1.5' })).toThrow(/DB_CONNECT_BACKOFF_MS/)
  })

  it('supports legacy Valkey env aliases during the cache migration', () => {
    const cfg = loadConfig({
      VALKEY_HOST: 'legacy-cache.internal',
      VALKEY_PORT: '6381'
    })

    expect(cfg.garnet.host).toBe('legacy-cache.internal')
    expect(cfg.garnet.port).toBe(6381)
  })

  it('rejects invalid booleans and URLs', () => {
    expect(() => loadConfig({ SPACETIMEDB_URI: 'not-a-url' })).toThrow(/Invalid URL/)
    expect(() => loadConfig({ SPACETIMEAUTH_AUTHORITY: 'not-a-url' })).toThrow(/Invalid URL/)
    expect(() => loadConfig({ PUSH_APNS_USE_SANDBOX: 'maybe' })).toThrow(/PUSH_APNS_USE_SANDBOX/)
  })
})
