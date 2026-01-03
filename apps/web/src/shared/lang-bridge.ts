import { createContextId, useComputed$, useContext, useContextProvider, useSignal, useVisibleTask$, type Signal } from '@builder.io/qwik'
import { initLang, lang, subscribeLang, type Lang } from './lang-store'
import { getUiCopy } from './ui-copy'

const LangSignalContext = createContextId<Signal<Lang>>('lang-signal')

export const useLangSignal = () => {
  const current = useSignal(lang.value)

  useVisibleTask$(
    ({ cleanup }) => {
      current.value = initLang()
      const dispose = subscribeLang((value) => {
        current.value = value
      })
      cleanup(() => dispose())
    },
    { strategy: 'document-ready' }
  )

  return current
}

export const useLangProvider = () => {
  const langSignal = useLangSignal()
  useContextProvider(LangSignalContext, langSignal)
  return langSignal
}

export const useSharedLangSignal = () => useContext(LangSignalContext, useLangSignal())

export const useLangCopy = (langSignal: Signal<Lang> = useSharedLangSignal()) => useComputed$(() => getUiCopy(langSignal.value))
