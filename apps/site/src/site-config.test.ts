import { describe, expect, it } from 'bun:test'
import { resolvePublicAppConfig } from './site-config'

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
})
