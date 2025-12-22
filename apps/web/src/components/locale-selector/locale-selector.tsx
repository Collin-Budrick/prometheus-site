import { $, component$, getLocale, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { useLocation } from '@builder.io/qwik-city'
import { localeNames, locales } from 'compiled-i18n'

type MotionModule = typeof import('motion/mini')
type AnimateFn = MotionModule['animate']

export const LocaleSelector = component$(() => {
  const loc = useLocation()
  const menuRef = useSignal<HTMLDetailsElement>()
  const panelRef = useSignal<HTMLDivElement>()
  const currentLocale = (() => {
    const segments = loc.url.pathname.split('/').filter(Boolean)
    const segmentLocale = segments[0]
    if (segmentLocale && locales.includes(segmentLocale as any)) return segmentLocale as any
    return getLocale()
  })()

  useVisibleTask$(({ track }) => {
    if (typeof document === 'undefined') return

    const menu = track(() => menuRef.value)
    const panel = track(() => panelRef.value)
    if (!menu || !panel) return

    let activeAnimation: Animation | undefined
    let animateFn: AnimateFn | null = null
    let motionPromise: Promise<MotionModule> | null = null
    let animationToken = 0
    const prefersReducedMotion = () =>
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

    const loadAnimate = async () => {
      if (animateFn) return animateFn
      if (!motionPromise) motionPromise = import('motion/mini')
      const mod = await motionPromise
      animateFn = mod.animate
      return animateFn
    }

    const prewarmMotion = () => {
      if (prefersReducedMotion()) return
      if (navigator.connection?.saveData) return
      const warm = () => {
        void loadAnimate()
      }
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(warm, { timeout: 1500 })
      } else {
        setTimeout(warm, 200)
      }
    }

    const runAnimation = async (
      token: number,
      keyframes: Record<string, string[] | number[]>,
      options: { duration: number; easing: string },
      onFinish: () => void
    ) => {
      const animate = await loadAnimate()
      if (token !== animationToken) return
      const animation = animate(panel, keyframes, options)
      activeAnimation = animation
      animation.finished.then(() => {
        if (token !== animationToken) return
        onFinish()
        if (activeAnimation === animation) {
          activeAnimation = undefined
        }
      })
    }

    const animateOpen = () => {
      activeAnimation?.cancel()
      animationToken += 1
      const token = animationToken
      panel.style.display = 'grid'
      delete menu.dataset.closing
      if (prefersReducedMotion()) return
      panel.style.opacity = '0'
      panel.style.transform = 'translateY(-8px)'
      panel.style.filter = 'blur(8px)'
      void runAnimation(
        token,
        { opacity: [0, 1], transform: ['translateY(-8px)', 'translateY(0)'], filter: ['blur(8px)', 'blur(0px)'] },
        { duration: 0.22, easing: 'ease-out' },
        () => {
          panel.style.removeProperty('opacity')
          panel.style.removeProperty('transform')
          panel.style.removeProperty('filter')
        }
      )
    }

    const animateClose = () => {
      activeAnimation?.cancel()
      animationToken += 1
      const token = animationToken
      menu.dataset.closing = 'true'
      if (prefersReducedMotion()) {
        panel.style.display = 'none'
        delete menu.dataset.closing
        return
      }
      void runAnimation(
        token,
        { opacity: [1, 0], transform: ['translateY(0)', 'translateY(-6px)'], filter: ['blur(0px)', 'blur(8px)'] },
        { duration: 0.18, easing: 'ease-in' },
        () => {
          panel.style.display = 'none'
          panel.style.removeProperty('opacity')
          panel.style.removeProperty('transform')
          panel.style.removeProperty('filter')
          delete menu.dataset.closing
        }
      )
    }

    const handleToggle = () => {
      if (menu.open) {
        animateOpen()
        return
      }
      animateClose()
    }

    if (menu.open) {
      panel.style.display = 'grid'
    }

    prewarmMotion()
    menu.addEventListener('toggle', handleToggle)

    return () => {
      menu.removeEventListener('toggle', handleToggle)
    }
  })

  const applyTheme = $((theme: 'light' | 'dark' | 'system') => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    if (theme === 'system') {
      root.removeAttribute('data-theme')
      root.classList.remove('light', 'dark')
    } else {
      root.setAttribute('data-theme', theme)
      root.classList.remove('light', 'dark')
    }
    window.localStorage.setItem('theme', theme)
  })

  const buildHref = (nextLocale: string) => {
    const segments = loc.url.pathname.split('/').filter(Boolean)
    const hasLocale = segments.length > 0 && locales.includes(segments[0] as any)
    const rest = hasLocale ? segments.slice(1) : segments
    const pathname = `/${nextLocale}${rest.length ? `/${rest.join('/')}` : ''}`

    const params = new URLSearchParams(loc.url.search)
    params.delete('locale')
    const search = params.toString()
    return `${pathname}${search ? `?${search}` : ''}`
  }

  return (
    <details ref={menuRef} class="settings-menu">
      <summary class="settings-trigger" aria-label="Settings">
        <svg class="settings-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065Z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path d="M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z" fill="none" stroke="currentColor" stroke-width="1.4" />
        </svg>
      </summary>
      <div ref={panelRef} class="settings-panel">
        <details class="settings-group">
          <summary class="settings-group-trigger">Language</summary>
          <div class="settings-group-panel">
            {locales.map((locale) => {
              const isCurrent = locale === (currentLocale as any)
              const href = buildHref(locale)
              return (
                <a
                  key={locale}
                  href={href}
                  aria-disabled={isCurrent}
                  aria-current={isCurrent ? 'true' : undefined}
                  style={isCurrent ? { viewTransitionName: 'locale-pill' } : undefined}
                  class="settings-option"
                >
                  {localeNames[locale] ?? locale.toUpperCase()}
                </a>
              )
            })}
          </div>
        </details>
        <details class="settings-group">
          <summary class="settings-group-trigger">Theme</summary>
          <div class="settings-group-panel">
            <button type="button" class="settings-option" onClick$={() => applyTheme('system')}>
              System
            </button>
            <button type="button" class="settings-option" onClick$={() => applyTheme('light')}>
              Light
            </button>
            <button type="button" class="settings-option" onClick$={() => applyTheme('dark')}>
              Dark
            </button>
          </div>
        </details>
      </div>
    </details>
  )
})
