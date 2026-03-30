import { describe, expect, it } from 'bun:test'
import { buildPublicSiteAuthUrl, resolvePublicAppConfig } from './site-config'

describe('resolvePublicAppConfig', () => {
  it('normalizes Partytown defaults and forwarded globals', () => {
    const config = resolvePublicAppConfig({
      partytown: {
        enabled: true,
        forward: [' dataLayer.push ', '', 'gtag ']
      }
    })

    expect(config.partytown).toEqual({
      enabled: true,
      forward: ['dataLayer.push', 'gtag']
    })
  })

  it('falls back to public auth env values when runtime config is missing them', () => {
    const config = resolvePublicAppConfig(undefined, {
      VITE_AUTH_BASE_PATH: '/api/auth',
      VITE_AUTH_SOCIAL_PROVIDERS: 'google, facebook',
      VITE_OIDC_AUTHORITY: 'urn:prometheus:better-auth',
      VITE_OIDC_CLIENT_ID: 'prometheus-site',
      VITE_OIDC_JWKS_URI: 'https://prometheus.prod/api/auth/jwks',
      VITE_SPACETIMEDB_URI: 'https://db.prometheus.dev',
      VITE_SPACETIMEDB_MODULE: 'prometheus-site-local'
    })

    expect(config.authBasePath).toBe('/api/auth')
    expect(config.authSocialProviders).toEqual(['google', 'facebook'])
    expect(config.oidcAuthority).toBe('urn:prometheus:better-auth')
    expect(config.oidcClientId).toBe('prometheus-site')
    expect(config.oidcJwksUri).toBe('https://prometheus.prod/api/auth/jwks')
    expect(config.spacetimeDbUri).toBe('https://db.prometheus.dev')
    expect(config.spacetimeDbModule).toBe('prometheus-site-local')
  })

  it('reads the inline public app config from globalThis when env values are unavailable', () => {
    const host = globalThis as typeof globalThis & {
      __PUBLIC_APP_CONFIG__?: Record<string, unknown>
    }
    const previous = host.__PUBLIC_APP_CONFIG__
    host.__PUBLIC_APP_CONFIG__ = {
      apiBase: '/api',
      authBasePath: '/api/auth',
      oidcAuthority: 'urn:prometheus:better-auth',
      oidcClientId: 'prometheus-site'
    }

    try {
      const config = resolvePublicAppConfig()

      expect(config.apiBase).toBe('/api')
      expect(config.authBasePath).toBe('/api/auth')
      expect(config.oidcAuthority).toBe('urn:prometheus:better-auth')
      expect(config.oidcClientId).toBe('prometheus-site')
    } finally {
      if (previous === undefined) {
        delete host.__PUBLIC_APP_CONFIG__
      } else {
        host.__PUBLIC_APP_CONFIG__ = previous
      }
    }
  })

  it('keeps Rust site auth routes on the current origin instead of nesting them under /api/auth', () => {
    expect(buildPublicSiteAuthUrl('/auth/session/sync', 'https://prometheus.prod')).toBe(
      'https://prometheus.prod/auth/session/sync'
    )
  })
})
