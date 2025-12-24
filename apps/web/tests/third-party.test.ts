import { describe, expect, it } from 'bun:test'

import { validateThirdPartyEnv } from './third-party'

describe('validateThirdPartyEnv', () => {
  it('normalizes ids and urls while preserving valid values', () => {
    const env = validateThirdPartyEnv({
      gaId: ' G-TEST123 ',
      adsClient: 'ca-pub-1234567890123456',
      supportWidgetSrc: 'https://example.com/widget.js '
    })

    expect(env.gaId).toBe('G-TEST123')
    expect(env.adsClient).toBe('ca-pub-1234567890123456')
    expect(env.supportWidgetSrc).toBe('https://example.com/widget.js')
  })

  it('treats empty values as undefined', () => {
    const env = validateThirdPartyEnv({ gaId: '   ', adsClient: '', supportWidgetSrc: '\n' })

    expect(env.gaId).toBeUndefined()
    expect(env.adsClient).toBeUndefined()
    expect(env.supportWidgetSrc).toBeUndefined()
  })

  it('rejects invalid GA IDs', () => {
    expect(() => validateThirdPartyEnv({ gaId: 'UA-12345' })).toThrow(/VITE_GTAG_ID/)
  })

  it('rejects invalid AdSense client IDs', () => {
    expect(() => validateThirdPartyEnv({ adsClient: 'pub-1234' })).toThrow(/VITE_ADSENSE_CLIENT/)
  })

  it('rejects support widget sources without an absolute URL', () => {
    expect(() => validateThirdPartyEnv({ supportWidgetSrc: '/widget.js' })).toThrow(/VITE_SUPPORT_WIDGET_SRC/)
    expect(() => validateThirdPartyEnv({ supportWidgetSrc: 'ftp://example.com/widget.js' })).toThrow(
      /VITE_SUPPORT_WIDGET_SRC/
    )
  })
})
