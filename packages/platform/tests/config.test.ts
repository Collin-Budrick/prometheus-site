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
      UNKEY_RATELIMIT_BASE_URL: 'https://unkey.example.com'
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
  })
})
