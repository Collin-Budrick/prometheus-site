import { describe, expect, it } from 'bun:test'
import { resolvePublicAppConfig } from './public-app-config'

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
