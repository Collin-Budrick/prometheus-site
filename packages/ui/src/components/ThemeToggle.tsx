import { $, component$, useSignal, useVisibleTask$, type PropFunction } from '@builder.io/qwik'
import { applyTheme, initTheme, readStoredTheme, subscribeTheme, theme as themeStore, type Theme } from '../theme-store'

type ThemeToggleLabels = {
  ariaToDark: string
  ariaToLight: string
}

type ThemeToggleProps = {
  class?: string
  labels: ThemeToggleLabels
  initialTheme?: Theme
  onToggle$?: PropFunction<(nextTheme: Theme) => void | Promise<void>>
}

const SunIcon = () => (
  <svg
    class="theme-toggle-icon"
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v3" />
    <path d="M12 19v3" />
    <path d="M4.22 4.22l2.12 2.12" />
    <path d="M17.66 17.66l2.12 2.12" />
    <path d="M2 12h3" />
    <path d="M19 12h3" />
    <path d="M4.22 19.78l2.12-2.12" />
    <path d="M17.66 6.34l2.12-2.12" />
  </svg>
)

const MoonIcon = () => (
  <svg
    class="theme-toggle-icon"
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M21 12.8a9 9 0 1 1-9.8-9 7 7 0 0 0 9.8 9z" />
  </svg>
)

type ViewTransitionHandle = {
  ready?: Promise<void>
  finished: Promise<void>
}

type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void) => ViewTransitionHandle
}

export const ThemeToggle = component$<ThemeToggleProps>(({ class: className, labels, initialTheme, onToggle$ }) => {
  const themeSignal = useSignal<Theme>(initialTheme ?? themeStore.value)
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
  }, { strategy: 'document-idle' })

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

    const finalizeTransition = () => {
      delete root.dataset.themeDirection
      if (previousViewTransitionName) {
        root.style.setProperty('view-transition-name', previousViewTransitionName)
      } else {
        root.style.removeProperty('view-transition-name')
      }
    }

    const startTransition = () => {
      try {
        const transition = doc.startViewTransition(() => {
          applyNextTheme()
        })

        void transition.finished.finally(finalizeTransition)
      } catch {
        applyNextTheme()
        finalizeTransition()
      }
    }

    if (document.visibilityState !== 'visible') {
      applyNextTheme()
      finalizeTransition()
      return
    }

    root.dataset.themeDirection = nextTheme

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(startTransition)
    } else {
      startTransition()
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
        <SunIcon />
      ) : (
        <MoonIcon />
      )}
    </button>
  )
})
