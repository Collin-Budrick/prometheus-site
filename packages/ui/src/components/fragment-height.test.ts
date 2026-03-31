import { describe, expect, it } from 'bun:test'
import {
  buildFragmentHeightCookieValue,
  buildFragmentHeightPlanSignature,
  buildFragmentHeightVersionSignature,
  clearFragmentLiveMinHeight,
  FRAGMENT_LIVE_MIN_HEIGHT_VAR,
  FRAGMENT_RESERVED_HEIGHT_VAR,
  mergeFragmentHeightCookieValue,
  readFragmentLiveMinHeight,
  readFragmentReservationHeight,
  readFragmentHeightCookieHeights,
  resolveFragmentHeightWidthBucket,
  resolveReservedFragmentHeight,
  writeFragmentLiveMinHeight,
  writeFragmentReservationHeight
} from './fragment-height'

describe('fragment height helpers', () => {
  const createTarget = () => {
    const attrs = new Map<string, string>()
    const styles = new Map<string, string>()

    return {
      attrs,
      styles,
      element: {
        getAttribute: (name: string) => attrs.get(name) ?? null,
        setAttribute: (name: string, value: string) => {
          attrs.set(name, value)
        },
        removeAttribute: (name: string) => {
          attrs.delete(name)
        },
        style: {
          getPropertyValue: (name: string) => styles.get(name) ?? '',
          setProperty: (name: string, value: string) => {
            styles.set(name, value)
          },
          removeProperty: (name: string) => {
            styles.delete(name)
            return ''
          }
        }
      }
    }
  }

  it('prefers learned height, then cookie height, then authored profile and fallback sizes', () => {
    expect(
      resolveReservedFragmentHeight({
        layout: {
          size: 'small',
          minHeight: 440,
          heightHint: { desktop: 489 },
          heightProfile: {
            desktop: [
              { maxWidth: 560, height: 544 },
              { maxWidth: 760, height: 489 }
            ]
          }
        },
        viewport: 'desktop',
        cookieHeight: 633,
        stableHeight: 579
      })
    ).toBe(579)

    expect(
      resolveReservedFragmentHeight({
        layout: {
          size: 'small',
          minHeight: 440,
          heightHint: { desktop: 489 },
          heightProfile: {
            desktop: [{ maxWidth: 760, height: 489 }]
          }
        },
        viewport: 'desktop',
        cookieHeight: 633
      })
    ).toBe(633)

    expect(
      resolveReservedFragmentHeight({
        layout: {
          size: 'small',
          minHeight: 440,
          heightHint: { desktop: 489 },
          heightProfile: {
            desktop: [{ maxWidth: 760, height: 544 }]
          }
        },
        viewport: 'desktop',
        cardWidth: 520
      })
    ).toBe(544)

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

  it('selects width buckets from authored profiles and quantizes widths otherwise', () => {
    expect(
      resolveFragmentHeightWidthBucket({
        layout: {
          heightProfile: {
            desktop: [
              { maxWidth: 560, height: 544 },
              { maxWidth: 760, height: 489 }
            ]
          }
        },
        viewport: 'desktop',
        cardWidth: 540
      })
    ).toBe('profile:560')

    expect(
      resolveFragmentHeightWidthBucket({
        layout: {
          size: 'small'
        },
        viewport: 'desktop',
        cardWidth: 641
      })
    ).toBe('width:800')
  })

  it('validates cookie route metadata and plan signatures before reusing heights', () => {
    const fragmentIds = ['fragment://page/store/stream@v5', 'fragment://page/store/cart@v1']
    const planSignature = buildFragmentHeightPlanSignature(fragmentIds)
    const versionSignature = buildFragmentHeightVersionSignature({
      'fragment://page/store/stream@v5': 11,
      'fragment://page/store/cart@v1': 7
    }, fragmentIds)
    const cookieValue = buildFragmentHeightCookieValue({
      path: '/store',
      lang: 'en',
      viewport: 'desktop',
      planSignature,
      versionSignature,
      widthBucket: 'width:800',
      heights: [633, 440]
    })
    const cookieHeader = `prom_frag_h=${encodeURIComponent(cookieValue)}`

    expect(
      readFragmentHeightCookieHeights(cookieHeader, {
        path: '/store',
        lang: 'en',
        viewport: 'desktop',
        planSignature,
        versionSignature,
        widthBucket: 'width:800'
      })
    ).toEqual([633, 440])

    expect(
      readFragmentHeightCookieHeights(cookieHeader, {
        path: '/store',
        lang: 'en',
        viewport: 'desktop',
        planSignature: `${planSignature}-stale`,
        versionSignature,
        widthBucket: 'width:800'
      })
    ).toBeNull()
  })

  it('merges measured heights back into the current-route cookie by plan order', () => {
    const fragmentIds = ['fragment://page/home/manifest@v1', 'fragment://page/home/planner@v1']
    const planSignature = buildFragmentHeightPlanSignature(fragmentIds)
    const versionSignature = buildFragmentHeightVersionSignature({
      'fragment://page/home/manifest@v1': 3,
      'fragment://page/home/planner@v1': 4
    }, fragmentIds)
    const cookieValue = mergeFragmentHeightCookieValue({
      path: '/',
      lang: 'en',
      planSignature,
      versionSignature,
      planIndex: 1,
      planCount: 2,
      height: 640,
      viewport: 'desktop',
      widthBucket: 'profile:560'
    })

    expect(cookieValue).toBe(`v2|%2F|en|desktop|${planSignature}|${encodeURIComponent(versionSignature)}|profile%3A560|,640`)
  })

  it('stores reservation height separately from the temporary live floor', () => {
    const { attrs, styles, element } = createTarget()

    expect(writeFragmentReservationHeight(element, 320)).toBe(320)
    expect(readFragmentReservationHeight(element)).toBe(320)
    expect(attrs.get('data-fragment-height-hint')).toBe('320')
    expect(styles.get(FRAGMENT_RESERVED_HEIGHT_VAR)).toBe('320px')
    expect(styles.get(FRAGMENT_LIVE_MIN_HEIGHT_VAR)).toBeUndefined()

    expect(writeFragmentLiveMinHeight(element, 280)).toBe(280)
    expect(readFragmentLiveMinHeight(element)).toBe(280)
    expect(styles.get(FRAGMENT_RESERVED_HEIGHT_VAR)).toBe('320px')
    expect(styles.get(FRAGMENT_LIVE_MIN_HEIGHT_VAR)).toBe('280px')

    clearFragmentLiveMinHeight(element)
    expect(readFragmentLiveMinHeight(element)).toBeNull()
    expect(readFragmentReservationHeight(element)).toBe(320)
    expect(styles.get(FRAGMENT_RESERVED_HEIGHT_VAR)).toBe('320px')
    expect(styles.get(FRAGMENT_LIVE_MIN_HEIGHT_VAR)).toBeUndefined()
  })
})
