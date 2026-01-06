import { describe, expect, it } from 'bun:test'

import { sanitizeAttributes } from '@core/fragments'

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

  it('preserves svg attributes for icon rendering', () => {
    const attrs = sanitizeAttributes({
      viewBox: '0 0 100 100',
      fill: 'currentColor',
      fillRule: 'evenodd',
      clipRule: 'evenodd',
      d: 'M0 0h10v10H0z',
      strokeWidth: '2',
      gradientUnits: 'userSpaceOnUse',
      stopColor: '#fff',
      offset: '0.5',
      stdDeviation: '3.5',
      colorInterpolationFilters: 'sRGB',
      filter: 'url(#blur)',
      xmlns: 'http://www.w3.org/2000/svg'
    })

    expect(attrs).toEqual({
      viewBox: '0 0 100 100',
      fill: 'currentColor',
      fillRule: 'evenodd',
      clipRule: 'evenodd',
      d: 'M0 0h10v10H0z',
      strokeWidth: '2',
      gradientUnits: 'userSpaceOnUse',
      stopColor: '#fff',
      offset: '0.5',
      stdDeviation: '3.5',
      colorInterpolationFilters: 'sRGB',
      filter: 'url(#blur)',
      xmlns: 'http://www.w3.org/2000/svg'
    })
  })
})
