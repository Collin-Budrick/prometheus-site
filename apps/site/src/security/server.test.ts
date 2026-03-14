import { describe, expect, it } from 'bun:test'
import { resolvePublicAppConfig } from '../public-app-config'
import { buildSiteConnectSrc, buildSiteCsp, getOrCreateRequestCspNonce } from './server'

describe('security/server', () => {
  it('builds an enforced CSP with strict script controls and Trusted Types', () => {
    const csp = buildSiteCsp({
      nonce: 'nonce-123',
      currentOrigin: 'https://prometheus.dev',
      config: resolvePublicAppConfig({
        spacetimeDbUri: '',
        spacetimeDbModule: ''
      })
    })

    expect(csp).toContain(
      `script-src 'nonce-nonce-123' 'strict-dynamic' 'unsafe-inline' https: http: 'inline-speculation-rules'`
    )
    expect(csp).toContain(`script-src-attr 'none'`)
    expect(csp).toContain(`'unsafe-inline'`)
    expect(csp).toContain(`https:`)
    expect(csp).toContain(`http:`)
    expect(csp).toContain(`require-trusted-types-for 'script'`)
    expect(csp).toContain('trusted-types prometheus-server-html prometheus-template-html')
    expect(csp).toContain(`frame-ancestors 'none'`)
  })

  it('keeps Trusted Types enforcement even when direct SpaceTimeDB is enabled', () => {
    const config = resolvePublicAppConfig({
      apiBase: 'https://api.prometheus.dev/api',
      spacetimeDbUri: 'https://db.prometheus.dev',
      spacetimeDbModule: 'prometheus-site'
    })

    const csp = buildSiteCsp({
      nonce: 'nonce-123',
      currentOrigin: 'https://prometheus.dev',
      config
    })

    expect(csp).toContain(
      `script-src 'nonce-nonce-123' 'strict-dynamic' 'unsafe-inline' 'unsafe-eval' https: http: 'inline-speculation-rules'`
    )
    expect(csp).toContain(`require-trusted-types-for 'script'`)
    expect(csp).toContain('trusted-types prometheus-server-html prometheus-template-html')
    expect(csp).toContain(`connect-src 'self' https://prometheus.dev https://api.prometheus.dev wss://api.prometheus.dev https://db.prometheus.dev wss://db.prometheus.dev`)
  })

  it('expands connect-src for api, websocket, webtransport, and analytics origins', () => {
    const config = resolvePublicAppConfig({
      apiBase: 'https://api.prometheus.dev/api',
      spacetimeDbUri: 'https://db.prometheus.dev',
      webTransportBase: 'https://prometheus.dev:4444',
      enableFragmentStreaming: true,
      preferWebTransport: true,
      analytics: {
        enabled: true,
        beaconUrl: 'https://analytics.prometheus.dev/collect'
      }
    })

    expect(buildSiteConnectSrc('https://prometheus.dev', config)).toEqual([
      "'self'",
      'https://prometheus.dev',
      'https://api.prometheus.dev',
      'wss://api.prometheus.dev',
      'https://db.prometheus.dev',
      'wss://db.prometheus.dev',
      'https://prometheus.dev:4444',
      'https://analytics.prometheus.dev'
    ])
  })

  it('creates and reuses a request-scoped nonce', () => {
    const sharedMap = new Map<string, unknown>()
    const requestLike = { sharedMap }

    const first = getOrCreateRequestCspNonce(requestLike)
    const second = getOrCreateRequestCspNonce(requestLike)

    expect(first).toBe(second)
    expect(first.length).toBeGreaterThan(10)
  })
})
