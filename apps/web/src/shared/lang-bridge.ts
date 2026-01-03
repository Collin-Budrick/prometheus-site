import { useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { initLang, lang, subscribeLang } from './lang-store'

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
