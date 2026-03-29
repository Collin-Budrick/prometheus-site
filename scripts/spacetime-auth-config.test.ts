import { describe, expect, it } from 'bun:test'

import {
  assertHostedAuthConfigForNonDevelopmentHosts,
  isDevelopmentHostname,
  resolveSpacetimeAuthConfig,
  withResolvedSpacetimeAuthEnv
} from './spacetime-auth-config'

describe('spacetime auth config helpers', () => {
  it('treats .dev hosts as development hosts', () => {
    expect(isDevelopmentHostname('prometheus.dev')).toBe(true)
    expect(isDevelopmentHostname('prometheus.prod')).toBe(false)
  })

  it('inherits public auth settings from the server env when only server values are provided', () => {
    expect(
      resolveSpacetimeAuthConfig({
        AUTH_JWT_ISSUER: 'urn:prometheus:better-auth',
        AUTH_JWT_AUDIENCE: 'prometheus-site',
        AUTH_JWKS_URI: 'http://convex-backend:3211/api/auth/jwks'
      })
    ).toMatchObject({
      serverAuthority: 'urn:prometheus:better-auth',
      serverClientId: 'prometheus-site',
      serverJwksUri: 'http://convex-backend:3211/api/auth/jwks',
      publicAuthority: 'urn:prometheus:better-auth',
      publicClientId: 'prometheus-site',
      publicJwksUri: 'http://convex-backend:3211/api/auth/jwks'
    })
  })

  it('copies a real public client id into the server env when only the public setting is present', () => {
    expect(
      withResolvedSpacetimeAuthEnv({
        VITE_OIDC_AUTHORITY: 'urn:prometheus:better-auth',
        VITE_OIDC_CLIENT_ID: 'prometheus-site',
        VITE_AUTH_BASE_PATH: '/api/auth'
      })
    ).toMatchObject({
      AUTH_BASE_PATH: '/api/auth',
      OIDC_AUTHORITY: 'urn:prometheus:better-auth',
      OIDC_CLIENT_ID: 'prometheus-site',
      SPACETIMEAUTH_AUTHORITY: 'urn:prometheus:better-auth',
      SPACETIMEAUTH_CLIENT_ID: 'prometheus-site',
      VITE_OIDC_AUTHORITY: 'urn:prometheus:better-auth',
      VITE_OIDC_CLIENT_ID: 'prometheus-site',
      VITE_SPACETIMEAUTH_AUTHORITY: 'urn:prometheus:better-auth',
      VITE_SPACETIMEAUTH_CLIENT_ID: 'prometheus-site'
    })
  })

  it('fails when a non-development host is missing the hosted auth secret', () => {
    expect(() =>
      assertHostedAuthConfigForNonDevelopmentHosts({
        context: 'preview',
        env: {
          PROMETHEUS_WEB_HOST: 'prometheus.dev',
          PROMETHEUS_WEB_HOST_PROD: 'prometheus.prod'
        }
      })
    ).toThrow(/BETTER_AUTH_SECRET/i)
  })

  it('allows a non-development host when a real hosted auth client is configured', () => {
    expect(() =>
      assertHostedAuthConfigForNonDevelopmentHosts({
        context: 'preview',
        env: {
          PROMETHEUS_WEB_HOST: 'prometheus.dev',
          PROMETHEUS_WEB_HOST_PROD: 'prometheus.prod',
          BETTER_AUTH_SECRET: 'test-secret',
          AUTH_JWT_ISSUER: 'urn:prometheus:better-auth',
          AUTH_JWT_AUDIENCE: 'prometheus-site',
          AUTH_JWKS_URI: 'http://convex-backend:3211/api/auth/jwks',
          CONVEX_SELF_HOSTED_URL: 'http://127.0.0.1:3210',
          CONVEX_SITE_PROXY_INTERNAL_URL: 'http://convex-backend:3211'
        }
      })
    ).not.toThrow()
  })
})
