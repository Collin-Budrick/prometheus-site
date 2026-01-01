import { describe, expect, it } from 'bun:test'

import { sanitizeAttributes } from './sanitize'

describe('sanitizeAttributes', () => {
  it('removes event handlers from attributes', () => {
    const attrs = sanitizeAttributes({ class: 'cta', onClick: 'alert(1)', onclick: 'alert(2)' })
    expect(attrs).toEqual({ class: 'cta' })
  })

  it('drops dangerous URL schemes', () => {
    const attrs = sanitizeAttributes({ href: 'javascript:alert(1)', title: 'demo' })
    expect(attrs).toEqual({ title: 'demo' })
  })

  it('preserves safe attributes and data/aria prefixes', () => {
    const attrs = sanitizeAttributes({
      href: '/docs',
      'data-test': 'fragment',
      'aria-label': 'Docs link',
      class: 'link'
    })

    expect(attrs).toEqual({
      href: '/docs',
      'data-test': 'fragment',
      'aria-label': 'Docs link',
      class: 'link'
    })
  })
})
