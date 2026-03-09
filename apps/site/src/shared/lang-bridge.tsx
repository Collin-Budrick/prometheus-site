import {
  Slot,
  component$,
  createContextId,
  useComputed$,
  useContext,
  useContextProvider,
  useSignal,
  useVisibleTask$,
  type Signal
} from '@builder.io/qwik'
import { seedLanguageResources } from '../lang/client'
import type { LanguageSeedPayload } from '../lang/selection'
import { getUiCopy } from './ui-copy'
import { initLang, lang, subscribeLang, type Lang } from './lang-store'

const LangSignalContext = createContextId<Signal<Lang>>('lang-signal')

const useFallbackLangSignal = (initialLang?: Lang) => useSignal<Lang>(initialLang ?? lang.value)

export const useLangSignal = (initialLang?: Lang) => {
  const current = useSignal<Lang>(initialLang ?? lang.value)

  useVisibleTask$(
    (ctx) => {
      const resolved = initLang()
      if (current.value !== resolved) {
        current.value = resolved
      }
      let ready = false
      const dispose = subscribeLang((value) => {
        if (!ready) {
          ready = true
          if (current.value !== value) {
            current.value = value
          }
          return
        }
        if (current.value === value) return
        current.value = value
      })
      ctx.cleanup(() => dispose())
    },
    { strategy: 'document-idle' }
  )

  return current
}

export const useProvideLangSignal = (initialLang?: Lang) => {
  const langSignal = useLangSignal(initialLang)
  useContextProvider(LangSignalContext, langSignal)
  return langSignal
}

export const useLanguageSeed = (
  seededLang: Lang | undefined,
  payload: LanguageSeedPayload | null | undefined,
  options: { full?: boolean } = {}
) => {
  if (seededLang && payload) {
    seedLanguageResources(seededLang, payload, options)
  }

  useVisibleTask$(
    (ctx) => {
      const langValue = ctx.track(() => seededLang)
      const nextPayload = ctx.track(() => payload)
      if (!langValue || !nextPayload) return
      seedLanguageResources(langValue, nextPayload, options)
    },
    { strategy: 'document-ready' }
  )
}

type LangProviderProps = {
  initialLang?: Lang
}

export const LangProvider = component$<LangProviderProps>(({ initialLang }) => {
  useProvideLangSignal(initialLang)
  return <Slot />
})

export const useSharedLangSignal = (initialLang?: Lang) => {
  const fallback = useFallbackLangSignal(initialLang)
  return useContext(LangSignalContext, fallback)
}

export const useLangCopy = (langSignal: Signal<Lang> = useSharedLangSignal()) =>
  useComputed$(() => getUiCopy(langSignal.value))
