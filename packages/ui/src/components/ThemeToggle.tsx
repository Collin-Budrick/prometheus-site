import { $, component$, useSignal, useVisibleTask$, type PropFunction } from '@builder.io/qwik'
import { InHalfMoon, InSunLight } from '@qwikest/icons/iconoir'
import { applyTheme, initTheme, readStoredTheme, subscribeTheme, theme as themeStore, type Theme } from '../theme-store'

type ThemeToggleLabels = {
  ariaToDark: string
  ariaToLight: string
}

type ThemeToggleProps = {
  class?: string
  labels: ThemeToggleLabels
  onToggle$?: PropFunction<(nextTheme: Theme) => void | Promise<void>>
}

type ViewTransitionHandle = {
  ready?: Promise<void>
  finished: Promise<void>
}

type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void) => ViewTransitionHandle
}

export const ThemeToggle = component$<ThemeToggleProps>(({ class: className, labels, onToggle$ }) => {
  const themeSignal = useSignal<Theme>(themeStore.value)
  const hasStoredPreference = useSignal(false)

  useVisibleTask$((ctx) => {
    hasStoredPreference.value = readStoredTheme() !== null
    themeSignal.value = initTheme()

    const dispose = subscribeTheme((value) => {
      if (themeSignal.value === value) return
      themeSignal.value = value
    })

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent) => {
      if (hasStoredPreference.value) return
      applyTheme(event.matches ? 'dark' : 'light', { persist: false })
    }

    media.addEventListener('change', handleChange)
    ctx.cleanup(() => {
      media.removeEventListener('change', handleChange)
      dispose()
    })
  })

  const toggleTheme = $(() => {
    if (typeof document === 'undefined') return
    const nextTheme: Theme = themeSignal.value === 'dark' ? 'light' : 'dark'
    const applyNextTheme = () => {
      hasStoredPreference.value = true
      applyTheme(nextTheme)
      void onToggle$?.(nextTheme)
    }

    const doc = document as DocumentWithViewTransition
    const root = document.documentElement
    const supportsTransition =
      typeof doc.startViewTransition === 'function' &&
      window.matchMedia('(prefers-reduced-motion: no-preference)').matches

    const previousViewTransitionName = root.style.getPropertyValue('view-transition-name')
    root.style.setProperty('view-transition-name', 'root')

    if (!supportsTransition) {
      applyNextTheme()
      if (previousViewTransitionName) {
        root.style.setProperty('view-transition-name', previousViewTransitionName)
      } else {
        root.style.removeProperty('view-transition-name')
      }
      return
    }

    root.dataset.themeDirection = nextTheme
    root.getBoundingClientRect()

    try {
      const transition = doc.startViewTransition(() => {
        applyNextTheme()
      })

      void transition.finished.finally(() => {
        delete root.dataset.themeDirection
        if (previousViewTransitionName) {
          root.style.setProperty('view-transition-name', previousViewTransitionName)
        } else {
          root.style.removeProperty('view-transition-name')
        }
      })
    } catch {
      applyNextTheme()
      delete root.dataset.themeDirection
      if (previousViewTransitionName) {
        root.style.setProperty('view-transition-name', previousViewTransitionName)
      } else {
        root.style.removeProperty('view-transition-name')
      }
    }
  })

  return (
    <button
      class={['theme-toggle', className].filter(Boolean).join(' ')}
      type="button"
      data-theme={themeSignal.value}
      aria-pressed={themeSignal.value === 'dark'}
      aria-label={themeSignal.value === 'dark' ? labels.ariaToLight : labels.ariaToDark}
      onClick$={() => {
        void toggleTheme()
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
