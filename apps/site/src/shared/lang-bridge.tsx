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
import { getUiCopy } from './ui-copy'
import { initLang, lang, subscribeLang, type Lang } from './lang-store'

const LangSignalContext = createContextId<Signal<Lang>>('lang-signal')

export const useLangSignal = () => {
  const current = useSignal(lang.value)

  useVisibleTask$(
    ({ cleanup }) => {
      current.value = initLang()
      let ready = false
      const dispose = subscribeLang((value) => {
        if (!ready) {
          ready = true
          current.value = value
          return
        }
        if (current.value === value) return
        current.value = value
      })
      cleanup(() => dispose())
    },
    { strategy: 'document-ready' }
  )

  return current
}

export const LangProvider = component$(() => {
  const langSignal = useLangSignal()
  useContextProvider(LangSignalContext, langSignal)
  return <Slot />
})

export const useSharedLangSignal = () => useContext(LangSignalContext) ?? useLangSignal()

export const useLangCopy = (langSignal: Signal<Lang> = useSharedLangSignal()) =>
  useComputed$(() => getUiCopy(langSignal.value))

