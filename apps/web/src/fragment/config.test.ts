import { afterEach, describe, expect, it } from 'bun:test'

import { getApiBase, getAppConfig, normalizeApiBase } from './config'

const originalApiBase = process.env.API_BASE
const clearProcessApiBase = () => {
  delete process.env.API_BASE
}

afterEach(() => {
  if (typeof originalApiBase === 'undefined') {
    delete process.env.API_BASE
  } else {
    process.env.API_BASE = originalApiBase
  }
})

describe('getApiBase', () => {
  it('normalizes absolute URLs and trims trailing slashes', () => {
    clearProcessApiBase()
    expect(getApiBase({ VITE_API_BASE: ' https://api.example.com/root/ ' })).toBe(
      'https://api.example.com/root'
    )
  })

  it('supports relative paths for same-origin APIs', () => {
    clearProcessApiBase()
    expect(getApiBase({ VITE_API_BASE: '/api' })).toBe('/api')
    expect(normalizeApiBase('/api/')).toBe('/api')
  })

  it('omits localhost defaults in production when unset', () => {
    clearProcessApiBase()
    expect(getApiBase({ MODE: 'production' })).toBe('')
  })

  it('falls back to localhost in development', () => {
    clearProcessApiBase()
    expect(getApiBase({ DEV: true })).toBe('http://127.0.0.1:4000')
  })

  it('rejects unsupported protocols', () => {
    clearProcessApiBase()
    expect(getApiBase({ VITE_API_BASE: 'ftp://api.example.com' })).toBe('')
  })
})

describe('getAppConfig', () => {
  it('composes platform flags and URLs from the environment', () => {
    const config = getAppConfig({
      VITE_API_BASE: '/api',
      VITE_ENABLE_WEBTRANSPORT_FRAGMENTS: 'true',
      VITE_ENABLE_WEBTRANSPORT_DATAGRAMS: 'false',
      VITE_ENABLE_FRAGMENT_COMPRESSION: 'true',
      VITE_ENABLE_PREFETCH: '1',
      VITE_ENABLE_ANALYTICS: '1',
      VITE_ANALYTICS_BEACON_URL: 'https://example.com/analytics',
      VITE_REPORT_CLIENT_ERRORS: '1',
      VITE_ERROR_BEACON_URL: 'https://example.com/errors'
    })

    expect(config.apiBase).toBe('/api')
    expect(config.webTransportBase).toBe('/api')
    expect(config.preferWebTransport).toBe(true)
    expect(config.preferWebTransportDatagrams).toBe(false)
    expect(config.preferFragmentCompression).toBe(true)
    expect(config.enablePrefetch).toBe(true)
    expect(config.analytics).toEqual({
      enabled: true,
      beaconUrl: 'https://example.com/analytics'
    })
    expect(config.clientErrors).toEqual({
      enabled: true,
      beaconUrl: 'https://example.com/errors'
    })
  })
})
