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
    <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8Z" />
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

const isLikelyNativeShellRuntime = () => {
  if (typeof window === 'undefined') return false
  const runtimeFlag = (window as { __prometheusNativeRuntime?: boolean }).__prometheusNativeRuntime
  if (runtimeFlag === true) return true
  if (runtimeFlag === false) return false

  if (window.location.protocol === 'tauri:' || window.location.protocol === 'ipc:') return true
  if (window.navigator.userAgent.toLowerCase().includes('tauri')) return true
  if (window.navigator.userAgent.toLowerCase().includes('wv')) return true
  return false
}

const supportsThemeViewTransitions = () => {
  if (typeof document === 'undefined') return false
  if (isLikelyNativeShellRuntime()) return false
  const doc = document as DocumentWithViewTransition
  if (typeof doc.startViewTransition !== 'function') return false
  if (!window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return false
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return false
  return CSS.supports('view-transition-name: none')
}

const runThemeFallbackTransition = (
  nextTheme: Theme,
  applyThemeChange: () => void,
  onComplete: () => void
) => {
  const body = document.body
  if (!body) {
    applyThemeChange()
    onComplete()
    return
  }

  const root = document.documentElement
  const toColor =
    nextTheme === 'dark'
      ? 'var(--theme-transition-dark-color, #0f172a)'
      : 'var(--theme-transition-light-color, #f97316)'
  const computed = getComputedStyle(root)
  const themeDuration = computed.getPropertyValue('--theme-transition-duration').trim()
  const themeEase = computed.getPropertyValue('--theme-transition-ease').trim()
  const rawDuration = Number.parseFloat(themeDuration.replace(/[^0-9.]/g, ''))
  const duration = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 1400
  const overlay = document.createElement('div')
  const reducedThemeName = nextTheme === 'dark' ? 'dark' : 'light'
  const direction = reducedThemeName === 'dark' ? '100%' : '-100%'
  overlay.style.position = 'fixed'
  overlay.style.inset = '0'
  overlay.style.background = toColor
  overlay.style.pointerEvents = 'none'
  overlay.style.zIndex = '99999'
  overlay.style.willChange = 'transform'
  overlay.style.transformOrigin = 'center'
  const easing = themeEase || 'cubic-bezier(0.42, 0, 0.58, 1)'
  body.appendChild(overlay)
  void overlay.getBoundingClientRect()
  let done = false
  const finalize = () => {
    if (done) return
    done = true
    overlay.remove()
    onComplete()
  }

  overlay.style.transform = 'translateY(0)'
  overlay.style.transition = `transform ${duration}ms ${easing}`
  const start = () => {
    applyThemeChange()
    overlay.style.transform = `translateY(${direction})`
  }
  window.setTimeout(finalize, duration + 150)
  overlay.addEventListener('transitionend', finalize, { once: true })
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(start)
  } else {
    start()
  }
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
      supportsThemeViewTransitions()

    const previousViewTransitionName = root.style.getPropertyValue('view-transition-name')
    root.style.setProperty('view-transition-name', 'root')

    const finalizeTransition = () => {
      delete root.dataset.themeDirection
      if (previousViewTransitionName) {
        root.style.setProperty('view-transition-name', previousViewTransitionName)
      } else {
        root.style.removeProperty('view-transition-name')
      }
    }

    root.dataset.themeDirection = nextTheme

    if (!supportsTransition) {
      runThemeFallbackTransition(nextTheme, applyNextTheme, () => {
        finalizeTransition()
      })
      return
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
