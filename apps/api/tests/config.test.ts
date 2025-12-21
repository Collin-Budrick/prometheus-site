import { describe, expect, test } from 'bun:test'
import { loadConfig } from '../src/config/env'

describe('loadConfig', () => {
  test('builds config with defaults when env is empty', () => {
    const config = loadConfig({})

    expect(config.postgres.connectionString).toBe(
      'postgresql://prometheus:secret@localhost:5433/prometheus'
    )
    expect(config.postgres.ssl).toBeFalse()
    expect(config.valkey).toEqual({ host: 'localhost', port: 6379 })
  })

  test('uses DATABASE_URL when provided', () => {
    const url = 'postgresql://custom:pass@db:5432/app'
    const config = loadConfig({ DATABASE_URL: url })

    expect(config.postgres.connectionString).toBe(url)
  })

  test('validates postgres ports and ssl values', () => {
    expect(() => loadConfig({ POSTGRES_PORT: 'not-a-number' })).toThrow('POSTGRES_PORT')
    expect(() => loadConfig({ POSTGRES_SSL: 'maybe' })).toThrow('POSTGRES_SSL')
  })

  test('rejects empty postgres credentials when provided', () => {
    expect(() => loadConfig({ POSTGRES_USER: '' })).toThrow('POSTGRES_USER')
    expect(() => loadConfig({ POSTGRES_PASSWORD: '' })).toThrow('POSTGRES_PASSWORD')
    expect(() => loadConfig({ POSTGRES_DB: '' })).toThrow('POSTGRES_DB')
  })

  test('validates valkey settings', () => {
    expect(() => loadConfig({ VALKEY_PORT: '0' })).toThrow('VALKEY_PORT')
    expect(() => loadConfig({ VALKEY_HOST: '' })).toThrow('VALKEY_HOST')
  })
})
