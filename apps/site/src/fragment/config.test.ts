import { describe, expect, it } from 'bun:test'

import { buildPublicApiUrl, resolvePublicAppConfig } from '../public-app-config'

describe('resolvePublicAppConfig', () => {
  it('falls back to client-friendly visibility defaults when platform defaults were injected', () => {
    const config = resolvePublicAppConfig({
      apiBase: '/api',
      fragmentVisibilityMargin: '0px',
      fragmentVisibilityThreshold: 0
    })

    expect(config.fragmentVisibilityMargin).toBe('60% 0px')
    expect(config.fragmentVisibilityThreshold).toBe(0.4)
  })

  it('preserves explicit visibility settings when env values were provided', () => {
    const config = resolvePublicAppConfig(
      {
        apiBase: '/api',
        fragmentVisibilityMargin: '0px',
        fragmentVisibilityThreshold: 0
      },
      {
        VITE_FRAGMENT_VISIBILITY_MARGIN: '0px',
        VITE_FRAGMENT_VISIBILITY_THRESHOLD: '0'
      }
    )

    expect(config.fragmentVisibilityMargin).toBe('0px')
    expect(config.fragmentVisibilityThreshold).toBe(0)
  })

  it('normalizes browser-facing URLs and flags', () => {
    const config = resolvePublicAppConfig({
      apiBase: ' https://api.example.com/root/ ',
      webTransportBase: ' https://wt.example.com/path/ ',
      preferWebTransportDatagrams: true,
      preferFragmentCompression: false,
      enableFragmentStreaming: true,
      authBootstrapPublicKey: '  key  '
    })

    expect(config.apiBase).toBe('https://api.example.com/root')
    expect(config.webTransportBase).toBe('https://wt.example.com/path')
    expect(config.preferWebTransportDatagrams).toBe(true)
    expect(config.preferFragmentCompression).toBe(false)
    expect(config.enableFragmentStreaming).toBe(true)
    expect(config.authBootstrapPublicKey).toBe('key')
  })
})

describe('buildPublicApiUrl', () => {
  it('joins same-origin relative API bases', () => {
    expect(buildPublicApiUrl('/auth/session', 'https://app.example.com', '/api')).toBe(
      'https://app.example.com/api/auth/session'
    )
  })

  it('keeps absolute API hosts for /api-prefixed paths', () => {
    expect(buildPublicApiUrl('/api/auth/session', 'https://app.example.com', 'https://api.example.com/api')).toBe(
      'https://api.example.com/api/auth/session'
    )
  })
})
