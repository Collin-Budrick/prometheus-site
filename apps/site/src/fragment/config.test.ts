import { afterEach, describe, expect, it } from 'bun:test'

import { normalizeApiBase, resolveApiBase, resolveAppConfig } from '@platform/env'

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

describe('resolveApiBase', () => {
  it('normalizes absolute URLs and trims trailing slashes', () => {
    clearProcessApiBase()
    expect(resolveApiBase({ VITE_API_BASE: ' https://api.example.com/root/ ' })).toBe(
      'https://api.example.com/root'
    )
  })

  it('supports relative paths for same-origin APIs', () => {
    clearProcessApiBase()
    expect(resolveApiBase({ VITE_API_BASE: '/api' })).toBe('/api')
    expect(normalizeApiBase('/api/')).toBe('/api')
  })

  it('omits localhost defaults in production when unset', () => {
    clearProcessApiBase()
    expect(resolveApiBase({ MODE: 'production' })).toBe('')
  })

  it('falls back to localhost in development', () => {
    clearProcessApiBase()
    expect(resolveApiBase({ DEV: true })).toBe('http://127.0.0.1:4000')
  })

  it('rejects unsupported protocols', () => {
    clearProcessApiBase()
    expect(resolveApiBase({ VITE_API_BASE: 'ftp://api.example.com' })).toBe('')
  })
})

describe('resolveAppConfig', () => {
  it('composes platform flags and URLs from the environment', () => {
    const config = resolveAppConfig({
      VITE_API_BASE: '/api',
      VITE_ENABLE_WEBTRANSPORT_FRAGMENTS: 'true',
      VITE_ENABLE_WEBTRANSPORT_DATAGRAMS: 'false',
      VITE_ENABLE_FRAGMENT_COMPRESSION: 'true',
      VITE_ENABLE_PREFETCH: '1',
      VITE_ENABLE_ANALYTICS: '1',
      VITE_ANALYTICS_BEACON_URL: 'https://example.com/analytics',
      VITE_ENABLE_HIGHLIGHT: '1',
      VITE_HIGHLIGHT_PROJECT_ID: 'highlight-project-id',
      VITE_HIGHLIGHT_PRIVACY: 'strict',
      VITE_HIGHLIGHT_SESSION_RECORDING: '1',
      VITE_HIGHLIGHT_CANVAS_SAMPLING: '2',
      MODE: 'production'
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
    expect(config.highlight).toEqual({
      enabled: true,
      projectId: 'highlight-project-id',
      privacySetting: 'strict',
      enableSessionRecording: true,
      enableCanvasRecording: true,
      canvasSampling: 2,
      environment: 'production',
      serviceName: 'site'
    })
  })
})
