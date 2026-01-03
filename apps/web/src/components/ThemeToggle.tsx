import { $, component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { useLangSignal } from '../shared/lang-bridge'
import { getUiCopy } from '../shared/ui-copy'

type Theme = 'light' | 'dark'

type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> }
}

const STORAGE_KEY = 'prometheus-theme'
const LIGHT_THEME_COLOR = '#f97316'
const DARK_THEME_COLOR = '#0f172a'

export const ThemeToggle = component$(() => {
  const theme = useSignal<Theme>('light')
  const hasStoredPreference = useSignal(false)
  const langSignal = useLangSignal()
  const copy = getUiCopy(langSignal.value)

  useVisibleTask$(({ cleanup }) => {
    const applyTheme = (next: Theme) => {
      theme.value = next
      document.documentElement.dataset.theme = next
      document.documentElement.style.colorScheme = next
      const meta = document.querySelector('meta[name="theme-color"]')
      if (meta) {
        meta.setAttribute('content', next === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR)
      }
    }

    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') {
      hasStoredPreference.value = true
      applyTheme(stored)
    } else {
      applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent) => {
      if (hasStoredPreference.value) return
      applyTheme(event.matches ? 'dark' : 'light')
    }

    if ('addEventListener' in media) {
      media.addEventListener('change', handleChange)
      cleanup(() => media.removeEventListener('change', handleChange))
    } else {
      media.addListener(handleChange)
      cleanup(() => media.removeListener(handleChange))
    }
  })

  const toggleTheme = $(() => {
    if (typeof document === 'undefined') return
    const nextTheme: Theme = theme.value === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.themeDirection = nextTheme
    const applyTheme = () => {
      theme.value = nextTheme
      hasStoredPreference.value = true
      document.documentElement.dataset.theme = nextTheme
      document.documentElement.style.colorScheme = nextTheme
      window.localStorage.setItem(STORAGE_KEY, nextTheme)
      const meta = document.querySelector('meta[name="theme-color"]')
      if (meta) {
        meta.setAttribute('content', nextTheme === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR)
      }
    }

    const doc = document as DocumentWithViewTransition
    const supportsTransition =
      typeof doc.startViewTransition === 'function' &&
      window.matchMedia('(prefers-reduced-motion: no-preference)').matches

    if (!supportsTransition) {
      applyTheme()
      delete document.documentElement.dataset.themeDirection
      return
    }

    try {
      const transition = doc.startViewTransition(() => {
        applyTheme()
      })

      transition.finished.finally(() => {
        delete document.documentElement.dataset.themeDirection
      })
    } catch {
      applyTheme()
      delete document.documentElement.dataset.themeDirection
    }
  })

  return (
    <button
      class="theme-toggle"
      type="button"
      data-theme={theme.value}
      aria-pressed={theme.value === 'dark'}
      aria-label={theme.value === 'dark' ? copy.themeAriaToLight : copy.themeAriaToDark}
      onClick$={() => {
        toggleTheme()
      }}
    >
      <span class="theme-toggle-indicator" aria-hidden="true" />
      <span class="theme-toggle-label">{theme.value === 'dark' ? copy.themeDark : copy.themeLight}</span>
    </button>
  )
})
