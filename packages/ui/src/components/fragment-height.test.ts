import { describe, expect, it } from 'bun:test'
import {
  buildFragmentHeightCookieValue,
  buildFragmentHeightPlanSignature,
  mergeFragmentHeightCookieValue,
  readFragmentHeightCookieHeights,
  resolveReservedFragmentHeight
} from './fragment-height'

describe('fragment height helpers', () => {
  it('prefers cookie height, then stable height, then authored hint and fallback sizes', () => {
    expect(
      resolveReservedFragmentHeight({
        layout: {
          size: 'small',
          minHeight: 440,
          heightHint: { desktop: 489 }
        },
        viewport: 'desktop',
        cookieHeight: 633,
        stableHeight: 579
      })
    ).toBe(633)

    expect(
      resolveReservedFragmentHeight({
        layout: {
          size: 'small',
          minHeight: 440,
          heightHint: { desktop: 489 }
        },
        viewport: 'desktop',
        stableHeight: 579
      })
    ).toBe(579)

    expect(
      resolveReservedFragmentHeight({
        layout: {
          size: 'small',
          minHeight: 440,
          heightHint: { desktop: 489 }
        },
        viewport: 'desktop'
      })
    ).toBe(489)

    expect(
      resolveReservedFragmentHeight({
        layout: {
          size: 'small',
          minHeight: 440
        },
        viewport: 'desktop'
      })
    ).toBe(440)
  })

  it('validates cookie route metadata and plan signatures before reusing heights', () => {
    const fragmentIds = ['fragment://page/store/stream@v5', 'fragment://page/store/cart@v1']
    const planSignature = buildFragmentHeightPlanSignature(fragmentIds)
    const cookieValue = buildFragmentHeightCookieValue({
      path: '/store',
      lang: 'en',
      viewport: 'desktop',
      planSignature,
      heights: [633, 440]
    })
    const cookieHeader = `prom_frag_h=${encodeURIComponent(cookieValue)}`

    expect(
      readFragmentHeightCookieHeights(cookieHeader, {
        path: '/store',
        lang: 'en',
        viewport: 'desktop',
        planSignature
      })
    ).toEqual([633, 440])

    expect(
      readFragmentHeightCookieHeights(cookieHeader, {
        path: '/store',
        lang: 'en',
        viewport: 'desktop',
        planSignature: `${planSignature}-stale`
      })
    ).toBeNull()
  })

  it('merges measured heights back into the current-route cookie by plan order', () => {
    const fragmentIds = ['fragment://page/home/manifest@v1', 'fragment://page/home/planner@v1']
    const planSignature = buildFragmentHeightPlanSignature(fragmentIds)
    const cookieValue = mergeFragmentHeightCookieValue({
      path: '/',
      lang: 'en',
      planSignature,
      planIndex: 1,
      planCount: 2,
      height: 640,
      viewport: 'desktop'
    })

    expect(cookieValue).toBe(`v1|%2F|en|desktop|${planSignature}|,640`)
  })
})
