import { $, component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { InHalfMoon, InSunLight } from '@qwikest/icons/iconoir'
import { useLangCopy, useSharedLangSignal } from '../shared/lang-bridge'
import {
  applyTheme as applyStoredTheme,
  initTheme,
  readStoredTheme,
  subscribeTheme,
  theme as themeStore,
  type Theme
} from '../shared/theme-store'

type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> }
}

export const ThemeToggle = component$(() => {
  const themeSignal = useSignal<Theme>(themeStore.value)
  const hasStoredPreference = useSignal(false)
  const langSignal = useSharedLangSignal()
  const copy = useLangCopy(langSignal)

  useVisibleTask$(({ cleanup }) => {
    hasStoredPreference.value = readStoredTheme() !== null
    themeSignal.value = initTheme()

    const dispose = subscribeTheme((value) => {
      if (themeSignal.value === value) return
      themeSignal.value = value
    })

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent) => {
      if (hasStoredPreference.value) return
      applyStoredTheme(event.matches ? 'dark' : 'light', { persist: false })
    }

    media.addEventListener('change', handleChange)
    cleanup(() => {
      media.removeEventListener('change', handleChange)
      dispose()
    })
  })

  const toggleTheme = $(() => {
    if (typeof document === 'undefined') return
    const nextTheme: Theme = themeSignal.value === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.themeDirection = nextTheme
    const applyNextTheme = () => {
      hasStoredPreference.value = true
      applyStoredTheme(nextTheme)
    }

    const doc = document as DocumentWithViewTransition
    const supportsTransition =
      typeof doc.startViewTransition === 'function' &&
      window.matchMedia('(prefers-reduced-motion: no-preference)').matches

    if (!supportsTransition) {
      applyNextTheme()
      delete document.documentElement.dataset.themeDirection
      return
    }

    try {
      const transition = doc.startViewTransition(() => {
        applyNextTheme()
      })

      transition.finished.finally(() => {
        delete document.documentElement.dataset.themeDirection
      })
    } catch {
      applyNextTheme()
      delete document.documentElement.dataset.themeDirection
    }
  })

  return (
    <button
      class="theme-toggle"
      type="button"
      data-theme={themeSignal.value}
      aria-pressed={themeSignal.value === 'dark'}
      aria-label={themeSignal.value === 'dark' ? copy.value.themeAriaToLight : copy.value.themeAriaToDark}
      onClick$={() => {
        toggleTheme()
      }}
    >
      {themeSignal.value === 'dark' ? (
        <InSunLight class="theme-toggle-icon" aria-hidden="true" />
      ) : (
        <InHalfMoon class="theme-toggle-icon" aria-hidden="true" />
      )}
    </button>
  )
})
