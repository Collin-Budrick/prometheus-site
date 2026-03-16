import { describe, expect, it } from 'bun:test'
import { buildPartytownHeadScript } from './partytown'

describe('buildPartytownHeadScript', () => {
  it('returns null when Partytown is disabled', () => {
    expect(
      buildPartytownHeadScript({
        config: {
          enabled: false,
          forward: ['dataLayer.push']
        },
        lib: '/~partytown/',
        nonce: 'nonce-123'
      })
    ).toBeNull()
  })

  it('includes lib, nonce, and forwarded globals when Partytown is enabled', () => {
    const script = buildPartytownHeadScript({
      config: {
        enabled: true,
        forward: ['dataLayer.push', 'gtag']
      },
      lib: '/~partytown/',
      nonce: 'nonce-123'
    })

    expect(script).toContain('/~partytown/')
    expect(script).toContain('"dataLayer.push"')
    expect(script).toContain('"gtag"')
    expect(script).toContain('nonce-123')
  })
})
