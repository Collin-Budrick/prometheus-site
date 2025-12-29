import { $, component$, getLocale, useSignal, useStylesScoped$, useVisibleTask$ } from '@builder.io/qwik'
import { Form, type ActionStore, useLocation } from '@builder.io/qwik-city'
import { _, localeNames, locales } from 'compiled-i18n'
import { getSpeculationMode } from '../config/page-config'
import { useMotionMini, type MotionMiniAnimateFn, type MotionMiniAnimationHandle } from './animations/use-motion-mini'

type MotionMiniAnimateOptions = NonNullable<Parameters<MotionMiniAnimateFn>[2]>

type LocaleSelectorProps = {
  hasSession: boolean
  signOutAction?: ActionStore<any, any>
}

const settingsStyles = `
.settings-trigger {
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(15, 23, 42, 0.6);
  color: #e2e8f0;
  transition: border-color 160ms ease, color 160ms ease, background-color 160ms ease, box-shadow 160ms ease;
}

.settings-trigger:hover {
  border-color: rgba(16, 185, 129, 0.5);
  color: #a7f3d0;
}

.settings-trigger:focus-visible {
  outline: 2px solid rgba(16, 185, 129, 0.6);
  outline-offset: 2px;
}

.settings-menu[open] .settings-trigger {
  border-color: rgba(16, 185, 129, 0.55);
  background: rgba(16, 185, 129, 0.12);
  color: #ecfdf5;
  box-shadow: 0 0 0 1px rgba(16, 185, 129, 0.18);
}

.settings-menu[open] .settings-panel {
  view-transition-name: settings-panel;
}

.settings-panel {
  background: #0b1220;
  border: 1px solid #1e293b;
  box-shadow: 0 15px 40px rgba(2, 6, 23, 0.55);
}

.settings-group {
  background: rgba(15, 23, 42, 0.55);
  border-color: rgba(30, 41, 59, 0.85);
}

.settings-group summary {
  color: #e2e8f0;
}

.settings-group summary::after {
  color: #94a3b8;
}

.settings-option {
  color: #e2e8f0;
  transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease;
}

.settings-option:hover {
  border-color: #334155;
  color: #a7f3d0;
  background: rgba(15, 23, 42, 0.85);
}

.settings-option[aria-disabled='true'] {
  pointer-events: none;
  border-color: rgba(16, 185, 129, 0.35);
  background: rgba(16, 185, 129, 0.12);
  color: #6ee7b7;
}
`

export const LocaleSelector = component$<LocaleSelectorProps>(({ hasSession, signOutAction }) => {
  useStylesScoped$(settingsStyles)
  const loc = useLocation()
  const menuRef = useSignal<HTMLDetailsElement>()
  const summaryRef = useSignal<HTMLElement>()
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
    const summary = track(() => summaryRef.value)
    const panel = track(() => panelRef.value)
    if (!menu || !summary || !panel) return

    menu.dataset.js = 'true'
    const motion = useMotionMini()
    let activeAnimation: MotionMiniAnimationHandle | null = null
    let animationToken = 0
    let isClosing = false
    let ignoreToggle = false

    const prewarmMotion = () => {
      motion.prewarm({ element: panel, willChange: 'opacity, transform, filter', delay: 0 })
    }

    const runAnimation = async (
      token: number,
      keyframes: Record<string, string[] | number[]>,
      options: MotionMiniAnimateOptions,
      onFinish: () => void
    ) => {
      panel.style.willChange = 'opacity, transform, filter'
      const animate = await motion.loadAnimate()
      if (token !== animationToken) return
      const animation = animate(panel, keyframes, options)
      activeAnimation = animation
      animation.finished
        .then(() => {
          if (token !== animationToken) return
          onFinish()
          if (activeAnimation === animation) {
            activeAnimation = null
          }
        })
        .finally(() => {
          if (token === animationToken) {
            panel.style.removeProperty('will-change')
          }
        })
    }

    const setMenuOpen = (next: boolean) => {
      ignoreToggle = true
      menu.open = next
      queueMicrotask(() => {
        ignoreToggle = false
      })
    }

    const animateOpen = () => {
      activeAnimation?.cancel()
      animationToken += 1
      const token = animationToken
      panel.style.display = 'grid'
      panel.style.willChange = 'opacity, transform, filter'
      delete menu.dataset.closing
      if (motion.prefersReducedMotion()) return
      panel.style.opacity = '0'
      panel.style.transform = 'translateY(-8px)'
      panel.style.filter = 'blur(8px)'
      panel.getBoundingClientRect()
      void runAnimation(
        token,
        { opacity: [0, 1], transform: ['translateY(-8px)', 'translateY(0)'], filter: ['blur(8px)', 'blur(0px)'] },
        { duration: 0.22, ease: 'easeOut' },
        () => {
          panel.style.removeProperty('opacity')
          panel.style.removeProperty('transform')
          panel.style.removeProperty('filter')
        }
      )
    }

    const animateClose = (onClosed?: () => void) => {
      activeAnimation?.cancel()
      animationToken += 1
      const token = animationToken
      menu.dataset.closing = 'true'
      panel.style.display = 'grid'
      panel.style.willChange = 'opacity, transform, filter'
      if (motion.prefersReducedMotion()) {
        panel.style.display = 'none'
        delete menu.dataset.closing
        onClosed?.()
        return
      }
      panel.style.opacity = '1'
      panel.style.transform = 'translateY(0)'
      panel.style.filter = 'blur(0px)'
      panel.getBoundingClientRect()
      void runAnimation(
        token,
        { opacity: [1, 0], transform: ['translateY(0)', 'translateY(-8px)'], filter: ['blur(0px)', 'blur(8px)'] },
        { duration: 0.22, ease: 'easeIn' },
        () => {
          panel.style.display = 'none'
          panel.style.removeProperty('opacity')
          panel.style.removeProperty('transform')
          panel.style.removeProperty('filter')
          delete menu.dataset.closing
          onClosed?.()
        }
      )
    }

    const handleSummaryClick = (event: Event) => {
      if (!menu.open) return
      event.preventDefault()
      event.stopPropagation()
      if (isClosing) return
      isClosing = true
      animateClose(() => {
        setMenuOpen(false)
        isClosing = false
      })
    }

    const handleToggle = () => {
      if (ignoreToggle) return
      if (menu.open) {
        animateOpen()
        return
      }
      if (isClosing) return
      animateClose()
    }

    if (menu.open) {
      panel.style.display = 'grid'
    }

    const setupGroupAnimation = (group: HTMLDetailsElement) => {
      const groupSummary = group.querySelector<HTMLElement>('summary')
      const groupPanel = group.querySelector<HTMLElement>('.settings-group-panel')
      if (!groupSummary || !groupPanel) return () => {}

      group.dataset.js = 'true'
      if (group.open) {
        groupPanel.style.display = 'grid'
      }

      motion.prewarm({ element: groupPanel, willChange: 'height, opacity', delay: 0 })

      let groupAnimation: MotionMiniAnimationHandle | null = null
      let groupToken = 0
      let groupIsClosing = false
      let groupIgnoreToggle = false

      const setGroupOpen = (next: boolean) => {
        groupIgnoreToggle = true
        group.open = next
        queueMicrotask(() => {
          groupIgnoreToggle = false
        })
      }

      const runGroupAnimation = async (direction: 'open' | 'close', onFinish: () => void) => {
        groupAnimation?.cancel()
        groupToken += 1
        const token = groupToken
        if (direction === 'close') {
          group.dataset.closing = 'true'
          groupPanel.style.display = 'grid'
        } else {
          delete group.dataset.closing
        }
        groupPanel.style.willChange = 'height, opacity'
        const slideResult = await motion.slide({
          element: groupPanel,
          direction,
          display: 'grid',
          duration: direction === 'open' ? 0.2 : 0.18,
          ease: direction === 'open' ? 'easeOut' : 'easeIn',
          opacity: true,
          onFinish: () => {
            if (token !== groupToken) return
            delete group.dataset.closing
            onFinish()
            groupAnimation = null
          }
        })
        if (token !== groupToken) return
        const animation = slideResult?.animation ?? null
        groupAnimation = animation
        if (animation) {
          animation.finished.finally(() => {
            if (token === groupToken) {
              groupPanel.style.removeProperty('will-change')
            }
          })
        } else {
          groupPanel.style.removeProperty('will-change')
        }
      }

      const animateGroupOpen = () => {
        void runGroupAnimation('open', () => {})
      }

      const animateGroupClose = (onClosed?: () => void) => {
        void runGroupAnimation('close', () => {
          onClosed?.()
        })
      }

      const handleGroupSummaryClick = (event: Event) => {
        if (!group.open) return
        event.preventDefault()
        event.stopPropagation()
        if (groupIsClosing) return
        groupIsClosing = true
        animateGroupClose(() => {
          setGroupOpen(false)
          groupIsClosing = false
        })
      }

      const handleGroupToggle = () => {
        if (groupIgnoreToggle) return
        if (group.open) {
          animateGroupOpen()
          return
        }
        if (groupIsClosing) return
        animateGroupClose()
      }

      groupSummary.addEventListener('click', handleGroupSummaryClick)
      group.addEventListener('toggle', handleGroupToggle)

      return () => {
        groupSummary.removeEventListener('click', handleGroupSummaryClick)
        group.removeEventListener('toggle', handleGroupToggle)
      }
    }

    const groupCleanup = Array.from(panel.querySelectorAll<HTMLDetailsElement>('.settings-group')).map((group) =>
      setupGroupAnimation(group)
    )

    prewarmMotion()
    summary.addEventListener('click', handleSummaryClick)
    menu.addEventListener('toggle', handleToggle)

    return () => {
      summary.removeEventListener('click', handleSummaryClick)
      menu.removeEventListener('toggle', handleToggle)
      groupCleanup.forEach((cleanup) => cleanup())
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

  const localePrefix = (() => {
    const segment = loc.url.pathname.split('/')[1] ?? ''
    return locales.includes(segment as any) ? `/${segment}` : ''
  })()
  const dashboardPath = `${localePrefix}/dashboard`
  const loginHref = `${localePrefix}/login?callback=${encodeURIComponent(dashboardPath)}`
  const registerHref = `${localePrefix}/register?callback=${encodeURIComponent(dashboardPath)}`
  const loginSpeculation = getSpeculationMode('/login')
  const registerSpeculation = getSpeculationMode('/register')

  return (
    <details ref={menuRef} class="settings-menu animated-details">
      <summary
        ref={summaryRef}
        class="settings-trigger"
        aria-label={_`Settings`}
        data-qwik-prime="settings"
      >
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
      <div ref={panelRef} class="settings-panel animated-panel">
        <details class="settings-group animated-details">
          <summary class="settings-group-trigger">{_`Language`}</summary>
          <div class="settings-group-panel animated-panel">
            <div class="settings-group-panel-inner">
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
          </div>
        </details>
        <details class="settings-group animated-details">
          <summary class="settings-group-trigger">{_`Account`}</summary>
          <div class="settings-group-panel animated-panel">
            <div class="settings-group-panel-inner">
              {hasSession ? (
                signOutAction ? (
                  <Form action={signOutAction} class="flex">
                    <button type="submit" class="settings-option">
                      {_`Sign out`}
                    </button>
                  </Form>
                ) : null
              ) : (
                <>
                  <a class="settings-option" href={loginHref} data-speculate={loginSpeculation}>
                    {_`Login`}
                  </a>
                  <a class="settings-option" href={registerHref} data-speculate={registerSpeculation}>
                    {_`Create an account`}
                  </a>
                </>
              )}
            </div>
          </div>
        </details>
        <details class="settings-group animated-details">
          <summary class="settings-group-trigger">{_`Theme`}</summary>
          <div class="settings-group-panel animated-panel">
            <div class="settings-group-panel-inner">
              <button type="button" class="settings-option" onClick$={() => applyTheme('system')}>
                {_`System`}
              </button>
              <button type="button" class="settings-option" onClick$={() => applyTheme('light')}>
                {_`Light`}
              </button>
              <button type="button" class="settings-option" onClick$={() => applyTheme('dark')}>
                {_`Dark`}
              </button>
            </div>
          </div>
        </details>
      </div>
    </details>
  )
})
