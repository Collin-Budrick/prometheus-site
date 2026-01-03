import { $, component$ } from '@builder.io/qwik'
import { applyLang } from '../shared/lang-store'
import { useLangSignal } from '../shared/lang-bridge'
import { getUiCopy } from '../shared/ui-copy'

export const LanguageToggle = component$(() => {
  const langSignal = useLangSignal()

  const toggleLang = $(() => {
    const next = langSignal.value === 'en' ? 'ko' : 'en'
    applyLang(next)
  })

  const copy = getUiCopy(langSignal.value)
  const label = langSignal.value === 'en' ? copy.languageShortEn : copy.languageShortKo
  const ariaLabel = langSignal.value === 'en' ? copy.languageAriaToKo : copy.languageAriaToEn

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
