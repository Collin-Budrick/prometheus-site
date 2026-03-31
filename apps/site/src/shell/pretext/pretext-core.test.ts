import { describe, expect, it } from 'bun:test'
import {
  buildPretextCacheKey,
  createPretextAdapter,
  normalizePretextTextSpec,
  type PretextWhiteSpace
} from './pretext-core'

type MockPreparedText = {
  text: string
  font: string
  whiteSpace: PretextWhiteSpace
}

const buildMockAdapter = () => {
  const prepareCalls: MockPreparedText[] = []
  const localeCalls: Array<string | undefined> = []
  const adapter = createPretextAdapter({
    prepare: (text, font, options) => {
      const prepared = {
        text,
        font,
        whiteSpace: options?.whiteSpace ?? 'normal'
      } satisfies MockPreparedText
      prepareCalls.push(prepared)
      return prepared
    },
    layout: (prepared, maxWidth, lineHeight) => {
      const measuredWidth = Array.from(prepared.text).reduce((total, character) => {
        return total + (/[\u0000-\u007f]/.test(character) ? 8 : 16)
      }, 0)
      const lineCount = Math.max(1, Math.ceil(measuredWidth / Math.max(1, maxWidth)))
      return {
        lineCount,
        height: Number((lineCount * lineHeight).toFixed(3))
      }
    },
    setLocale: (locale) => {
      localeCalls.push(locale)
    }
  })

  return {
    adapter,
    localeCalls,
    prepareCalls
  }
}

describe('pretext-core', () => {
  it('normalizes specs before building cache keys', () => {
    const baseSpec = {
      text: 'Fragments stay stable.',
      font: ' 600 16px system-ui ',
      lineHeight: 20.1264,
      lang: ' EN ',
      whiteSpace: undefined,
      maxLines: 3.8,
      maxHeight: 44.5678
    }

    expect(normalizePretextTextSpec(baseSpec)).toEqual({
      text: 'Fragments stay stable.',
      font: '600 16px system-ui',
      lineHeight: 20.126,
      lang: 'en',
      whiteSpace: 'normal',
      maxLines: 3,
      maxHeight: 44.568
    })

    expect(buildPretextCacheKey(baseSpec)).toBe(
      buildPretextCacheKey({
        ...baseSpec,
        font: '600 16px system-ui',
        lang: 'en',
        lineHeight: 20.126
      })
    )
    expect(buildPretextCacheKey(baseSpec)).not.toBe(
      buildPretextCacheKey({
        ...baseSpec,
        lang: 'ja'
      })
    )
  })

  it('caches prepared text until the locale changes', () => {
    const { adapter, localeCalls, prepareCalls } = buildMockAdapter()
    const spec = {
      text: 'Stable fragments.',
      font: '600 16px system-ui',
      lineHeight: 24,
      lang: 'en',
      whiteSpace: 'normal' as const
    }

    const first = adapter.measure(spec, 160)
    const second = adapter.measure(spec, 160)

    expect(first?.height).toBe(24)
    expect(second?.height).toBe(24)
    expect(prepareCalls).toHaveLength(1)
    expect(adapter.getPreparedCacheSize()).toBe(1)
    expect(localeCalls).toEqual(['en'])

    const japanese = adapter.measure(
      {
        ...spec,
        lang: 'ja',
        text: '断片描画で安定配置。'
      },
      120
    )

    expect(japanese?.height).toBe(48)
    expect(prepareCalls).toHaveLength(2)
    expect(adapter.getPreparedCacheSize()).toBe(1)
    expect(localeCalls).toEqual(['en', 'ja'])
  })

  it('returns deterministic heights for english, japanese, and korean text and clamps by limits', () => {
    const { adapter } = buildMockAdapter()
    const font = '600 16px system-ui'

    expect(
      adapter.measure(
        {
          text: 'Fragment layout is stable.',
          font,
          lineHeight: 24,
          lang: 'en'
        },
        160
      )
    ).toEqual({
      cacheKey: buildPretextCacheKey({
        text: 'Fragment layout is stable.',
        font,
        lineHeight: 24,
        lang: 'en'
      }),
      height: 48,
      lineCount: 2
    })

    expect(
      adapter.measure(
        {
          text: '断片描画で安定配置。',
          font,
          lineHeight: 24,
          lang: 'ja'
        },
        120
      )
    ).toEqual({
      cacheKey: buildPretextCacheKey({
        text: '断片描画で安定配置。',
        font,
        lineHeight: 24,
        lang: 'ja'
      }),
      height: 48,
      lineCount: 2
    })

    expect(
      adapter.measure(
        {
          text: '조기 렌더로 흔들림 감소.',
          font,
          lineHeight: 24,
          lang: 'ko',
          maxLines: 2,
          maxHeight: 40
        },
        72
      )
    ).toEqual({
      cacheKey: buildPretextCacheKey({
        text: '조기 렌더로 흔들림 감소.',
        font,
        lineHeight: 24,
        lang: 'ko',
        maxLines: 2,
        maxHeight: 40
      }),
      height: 40,
      lineCount: 3
    })
  })
})
