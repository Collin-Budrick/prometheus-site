import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { resolveStaticHomeLanguageUrl } from './home-language-runtime'

const originalWindow = globalThis.window
const originalDocument = globalThis.document

describe('home-language-runtime', () => {
  beforeEach(() => {
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  })

  afterEach(() => {
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  })

  it('preserves the current route while swapping the lang query param', () => {
    expect(resolveStaticHomeLanguageUrl('https://prometheus.dev/?lang=en#dock', 'ja')).toBe(
      'https://prometheus.dev/?lang=ja#dock'
    )

    expect(resolveStaticHomeLanguageUrl('https://prometheus.dev/store/?q=kit#top', 'ko')).toBe(
      'https://prometheus.dev/store/?q=kit&lang=ko#top'
    )
  })
})
