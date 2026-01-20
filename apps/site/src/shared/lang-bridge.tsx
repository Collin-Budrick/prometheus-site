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

export const useLangSignal = (initialLang?: Lang) => {
  const current = useSignal<Lang>(initialLang ?? lang.value)

  useVisibleTask$(
    (ctx) => {
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

type LangProviderProps = {
  initialLang?: Lang
}

export const LangProvider = component$<LangProviderProps>(({ initialLang }) => {
  useProvideLangSignal(initialLang)
  return <Slot />
})

export const useSharedLangSignal = () => useContext(LangSignalContext) ?? useLangSignal()

export const useLangCopy = (langSignal: Signal<Lang> = useSharedLangSignal()) =>
  useComputed$(() => getUiCopy(langSignal.value))
