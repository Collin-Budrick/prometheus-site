import { useComputed$, useSignal, useVisibleTask$, type Signal } from '@builder.io/qwik'
import { initLang, lang, subscribeLang, type Lang } from './lang-store'
import { getUiCopy } from './ui-copy'

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

export const useLangCopy = (langSignal: Signal<Lang> = useLangSignal()) =>
  useComputed$(() => getUiCopy(langSignal.value))
