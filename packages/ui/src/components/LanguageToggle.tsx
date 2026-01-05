import { $, component$, type PropFunction, type Signal } from '@builder.io/qwik'
import { InTranslate } from '@qwikest/icons/iconoir'

export type LanguageToggleProps = {
  ariaLabels: Record<string, string>
  class?: string
  lang: Signal<string>
  onToggle$?: PropFunction<(current: string) => void | Promise<void>>
  pressed?: boolean | ((lang: string) => boolean)
}

export const LanguageToggle = component$<LanguageToggleProps>(({ ariaLabels, class: className, lang, onToggle$, pressed }) => {
  const ariaLabel = ariaLabels[lang.value] ?? ''
  const isPressed = typeof pressed === 'function' ? pressed(lang.value) : Boolean(pressed)

  return (
    <button
      class={['lang-toggle', className].filter(Boolean).join(' ')}
      type="button"
      data-lang={lang.value}
      aria-pressed={isPressed}
      aria-label={ariaLabel}
      onClick$={$(() => onToggle$?.(lang.value))}
    >
      <InTranslate class="lang-toggle-icon" aria-hidden="true" />
    </button>
  )
})
