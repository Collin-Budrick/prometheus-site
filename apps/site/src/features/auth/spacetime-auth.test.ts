import { describe, expect, it } from 'bun:test'

import { templateBranding } from '@prometheus/template-config'

import { resolveSpacetimeAuthMode } from './spacetime-auth'

describe('resolveSpacetimeAuthMode', () => {
  it('uses the local development fallback for the template placeholder client in dev', () => {
    expect(
      resolveSpacetimeAuthMode({
        authority: 'https://auth.spacetimedb.com/oidc',
        clientId: templateBranding.ids.authClientId,
        dev: true
      })
    ).toBe('dev-session')
  })

  it('treats the placeholder client as unconfigured outside development', () => {
    expect(
      resolveSpacetimeAuthMode({
        authority: 'https://auth.spacetimedb.com/oidc',
        clientId: templateBranding.ids.authClientId,
        dev: false
      })
    ).toBe('disabled')
  })

  it('keeps hosted auth enabled when a real client id is configured', () => {
    expect(
      resolveSpacetimeAuthMode({
        authority: 'https://auth.spacetimedb.com/oidc',
        clientId: 'real-client-id',
        dev: true
      })
    ).toBe('hosted')
  })
})
