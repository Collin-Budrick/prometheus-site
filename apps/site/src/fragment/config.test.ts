import { describe, expect, it } from 'bun:test'

import { buildPublicApiUrl, resolvePublicAppConfig } from '../public-app-config'

describe('resolvePublicAppConfig', () => {
  it('defaults fragment visibility to exact viewport intersection', () => {
    const config = resolvePublicAppConfig({
      apiBase: '/api'
    })

    expect(config.fragmentVisibilityMargin).toBe('0px')
    expect(config.fragmentVisibilityThreshold).toBe(0)
  })

  it('preserves explicit visibility settings', () => {
    const config = resolvePublicAppConfig({
      apiBase: '/api',
      fragmentVisibilityMargin: '15px',
      fragmentVisibilityThreshold: 0.25
    })

    expect(config.fragmentVisibilityMargin).toBe('15px')
    expect(config.fragmentVisibilityThreshold).toBe(0.25)
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
