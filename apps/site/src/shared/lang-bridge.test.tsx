import { afterEach, describe, expect, it, mock } from 'bun:test'

import { resetLanguageClientCacheForTests, seedLanguageResources } from '../lang/client'
import { defaultLang, lang } from './lang-store'

type MockSignal<T> = {
  value: T
}

const contextCalls: Array<{ context: unknown; fallback: unknown }> = []
let providedLangSignal: MockSignal<string> | undefined

mock.module('@builder.io/qwik', () => ({
  Slot: Symbol.for('qwik-slot'),
  component$(render: (...args: any[]) => unknown) {
    return render
  },
  createContextId(id: string) {
    return id
  },
  useComputed$(compute: () => unknown) {
    return { value: compute() }
  },
  useContext: (context: unknown, fallback: unknown) => {
    contextCalls.push({ context, fallback })
    return providedLangSignal ?? fallback
  },
  useContextProvider: () => undefined,
  useSignal(value: unknown) {
    return { value }
  },
  useVisibleTask$: () => undefined
}))

const { useLangCopy, useSharedLangSignal } = await import('./lang-bridge')

afterEach(() => {
  providedLangSignal = undefined
  contextCalls.length = 0
  resetLanguageClientCacheForTests()
  lang.value = defaultLang
})

describe('lang bridge', () => {
  it('does not throw when useLangCopy resolves without a provider', () => {
    lang.value = 'en'
    seedLanguageResources('en', {
      ui: {
        navHome: 'Home'
      }
    })

    expect(() => useLangCopy()).not.toThrow()

    contextCalls.length = 0
    const sharedLang = useSharedLangSignal()
    const copy = useLangCopy()

    expect(contextCalls[0]?.fallback).toEqual({ value: 'en' })
    expect(sharedLang.value).toBe('en')
    expect(copy.value.navHome).toBe('Home')
  })

  it('uses the provided context value when a provider is present', () => {
    providedLangSignal = { value: 'ja' }
    seedLanguageResources('ja', {
      ui: {
        navHome: '\u30db\u30fc\u30e0'
      }
    })

    const sharedLang = useSharedLangSignal('en')
    const copy = useLangCopy()

    expect(sharedLang).toBe(providedLangSignal)
    expect(copy.value.navHome).toBe('\u30db\u30fc\u30e0')
  })

  it('provides a baseline lang context from the root app shell', async () => {
    const rootSource = await Bun.file(new URL('../root.tsx', import.meta.url)).text()

    expect(rootSource).toContain('useProvideLangSignal()')
    expect(rootSource).toMatch(/<QwikCityProvider>[\s\S]*<RouterHead\s*\/>[\s\S]*<RouterOutlet\s*\/>/)
  })
})
