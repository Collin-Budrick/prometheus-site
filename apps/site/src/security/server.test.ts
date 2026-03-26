import { describe, expect, it } from 'bun:test'
import { resolvePublicAppConfig } from '../site-config'
import { buildSiteConnectSrc, buildSiteCsp, getOrCreateRequestCspNonce } from './server'

describe('security/server', () => {
  it('builds an enforced CSP with strict script controls and Trusted Types', () => {
    const csp = buildSiteCsp({
      nonce: 'nonce-123',
      currentOrigin: 'https://prometheus.dev',
      pathname: '/store',
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
    expect(csp).toContain(
      'trusted-types prometheus-server-html prometheus-template-html prometheus-runtime-script'
    )
    expect(csp).toContain(`frame-ancestors 'none'`)
  })

  it('keeps Trusted Types enforcement even when direct SpaceTimeDB is enabled', () => {
    const config = resolvePublicAppConfig({
      apiBase: 'https://api.prometheus.dev/api',
      spacetimeAuthAuthority: 'https://auth.spacetimedb.com/oidc',
      spacetimeDbUri: 'https://db.prometheus.dev',
      spacetimeDbModule: 'prometheus-site'
    })

    const csp = buildSiteCsp({
      nonce: 'nonce-123',
      currentOrigin: 'https://prometheus.dev',
      pathname: '/store',
      config
    })

    expect(csp).toContain(
      `script-src 'nonce-nonce-123' 'strict-dynamic' 'unsafe-inline' 'unsafe-eval' https: http: 'inline-speculation-rules'`
    )
    expect(csp).toContain(`require-trusted-types-for 'script'`)
    expect(csp).toContain(
      'trusted-types prometheus-server-html prometheus-template-html prometheus-runtime-script'
    )
    expect(csp).toContain(
      `connect-src 'self' https://prometheus.dev https://api.prometheus.dev wss://api.prometheus.dev https://auth.spacetimedb.com https://db.prometheus.dev wss://db.prometheus.dev`
    )
  })

  it('allows wasm compilation on the home route without enabling general eval', () => {
    const csp = buildSiteCsp({
      nonce: 'nonce-123',
      currentOrigin: 'https://prometheus.dev',
      pathname: '/',
      config: resolvePublicAppConfig({
        spacetimeDbUri: '',
        spacetimeDbModule: ''
      })
    })

    expect(csp).toContain(
      `script-src 'nonce-nonce-123' 'strict-dynamic' 'unsafe-inline' 'wasm-unsafe-eval' https: http: 'inline-speculation-rules'`
    )
    expect(csp).not.toContain(`'unsafe-eval'`)
  })

  it('expands connect-src for api, websocket, webtransport, and analytics origins', () => {
    const config = resolvePublicAppConfig({
      apiBase: 'https://api.prometheus.dev/api',
      spacetimeAuthAuthority: 'https://auth.spacetimedb.com/oidc',
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
      'https://auth.spacetimedb.com',
      'https://db.prometheus.dev',
      'wss://db.prometheus.dev',
      'https://prometheus.dev:4444',
      'https://analytics.prometheus.dev'
    ])
  })

  it('relaxes script and connect policies for the host Vite dev server when requested', () => {
    const csp = buildSiteCsp({
      nonce: 'nonce-123',
      currentOrigin: 'https://prometheus.dev',
      pathname: '/',
      allowDevServer: true,
      config: resolvePublicAppConfig({
        spacetimeDbUri: '',
        spacetimeDbModule: ''
      })
    })

    expect(csp).toContain(
      `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https: http: 'inline-speculation-rules'`
    )
    expect(csp).not.toContain(`'strict-dynamic'`)
    expect(csp).not.toContain(`'nonce-nonce-123'`)
    expect(csp).toContain(`connect-src 'self' https://prometheus.dev wss://prometheus.dev`)
    expect(csp).not.toContain(`trusted-types prometheus-server-html`)
    expect(csp).not.toContain(`require-trusted-types-for 'script'`)
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
