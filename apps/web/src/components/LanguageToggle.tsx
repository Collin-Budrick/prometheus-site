import { $, component$ } from '@builder.io/qwik'
import { applyLang } from '../shared/lang-store'
import { useLangCopy, useSharedLangSignal } from '../shared/lang-bridge'

export const LanguageToggle = component$(() => {
  const langSignal = useSharedLangSignal()
  const copy = useLangCopy(langSignal)

  const toggleLang = $(() => {
    const next = langSignal.value === 'en' ? 'ko' : 'en'
    applyLang(next)
  })

  const label = langSignal.value === 'en' ? copy.value.languageShortEn : copy.value.languageShortKo
  const ariaLabel = langSignal.value === 'en' ? copy.value.languageAriaToKo : copy.value.languageAriaToEn

  return (
    <button
      class="lang-toggle"
      type="button"
      data-lang={langSignal.value}
      aria-pressed={langSignal.value === 'ko'}
      aria-label={ariaLabel}
      onClick$={() => {
        toggleLang()
      }}
    >
      <span class="lang-toggle-indicator" aria-hidden="true" />
      <span class="lang-toggle-label">{label}</span>
    </button>
  )
})
