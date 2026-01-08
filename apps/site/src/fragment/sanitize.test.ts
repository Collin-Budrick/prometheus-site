import { describe, expect, it } from 'bun:test'

import { sanitizeAttributes } from '@core/fragments'
import { sanitizeHtml } from '@core/fragment/sanitize.server'

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

describe('sanitizeHtml', () => {
  it('removes scripts and unsafe attributes', () => {
    const html =
      '<div class="card" onclick="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)">bad</a></div>'
    const sanitized = sanitizeHtml(html)

    expect(sanitized).toContain('<div class="card">')
    expect(sanitized).toContain('<a>bad</a>')
    expect(sanitized).not.toContain('script')
    expect(sanitized).not.toContain('onclick')
    expect(sanitized).not.toContain('javascript:')
  })

  it('preserves svg and mathml content', () => {
    const html = [
      '<svg viewBox="0 0 10 10" class="icon"><circle cx="5" cy="5" r="4"></circle></svg>',
      '<math><mi>x</mi><mo>=</mo><mn>1</mn></math>'
    ].join('')
    const sanitized = sanitizeHtml(html)

    expect(sanitized).toContain('<svg')
    expect(sanitized).toContain('viewBox="0 0 10 10"')
    expect(sanitized).toContain('<circle')
    expect(sanitized).toContain('<math>')
    expect(sanitized).toContain('<mi>x</mi>')
  })
})
