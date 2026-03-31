import { describe, expect, it } from 'bun:test'
import {
  buildPretextTextAttrs,
  buildStaticWidthHints,
  resolveLayoutShellCardWidth,
  resolveLayoutShellContentWidth,
  resolveStaticHomeCardWidth,
  resolveStaticLoginStatusWidth
} from './pretext-static'

describe('pretext-static', () => {
  it('derives deterministic static shell widths from the shared layout constants', () => {
    expect(resolveLayoutShellContentWidth(390)).toBe(342)
    expect(resolveLayoutShellContentWidth(1440)).toBe(1072)
    expect(resolveLayoutShellCardWidth(1440)).toBe(1024)
    expect(resolveStaticHomeCardWidth(1440)).toBe(476)
    expect(resolveStaticHomeCardWidth(1024)).toBe(896)
    expect(resolveStaticLoginStatusWidth(1440)).toBe(996)
  })

  it('emits explicit width hints for attr-driven contracts', () => {
    const attrs = buildPretextTextAttrs({
      font: '600 24px system-ui',
      lang: 'en',
      lineHeight: 31.2,
      maxWidthCh: 42,
      role: 'title',
      text: 'Binary Fragment Platform',
      widthKind: 'layout-shell-card'
    })

    expect(attrs['data-pretext-width-desktop']).toBe(`${buildStaticWidthHints('layout-shell-card').desktop}`)
    expect(attrs['data-pretext-width-mobile']).toBe(`${buildStaticWidthHints('layout-shell-card').mobile}`)
    expect(attrs['data-pretext-max-width-ch']).toBe('42')
    expect(attrs['data-pretext-text']).toBe('Binary Fragment Platform')
  })
})
