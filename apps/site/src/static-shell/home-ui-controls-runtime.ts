import type { Lang } from '../lang/types'
import {
  bindOverlayDismiss,
  focusOverlayEntry,
  restoreOverlayFocusBeforeHide,
  setOverlaySurfaceState
} from '../shared/overlay-a11y'
import { getStaticHomeUiCopy } from './home-copy-store'

type Theme = 'light' | 'dark'

type HomeUiControlsController = {
  cleanupFns: Array<() => void>
  lang: Lang
}

type BindHomeUiControlsOptions = {
  controller: HomeUiControlsController
  onLanguageChange: (nextLang: Lang) => Promise<void> | void
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const STATIC_THEME_STORAGE_KEY = 'prometheus-theme'
const STATIC_THEME_COOKIE_KEY = 'prometheus-theme'
const STATIC_THEME_PREFERENCE_KEY = 'prometheus:pref:theme'
const LIGHT_THEME_COLOR = '#f97316'
const DARK_THEME_COLOR = '#0f172a'
const UI_CONTROLS_BOUND_ATTR = 'data-static-home-ui-controls-bound'

const createThemeIcon = (theme: Theme) => {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg')
  svg.setAttribute('class', 'theme-toggle-icon')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '1em')
  svg.setAttribute('height', '1em')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')

  const path = document.createElementNS(SVG_NAMESPACE, 'path')
  path.setAttribute(
    'd',
    theme === 'dark'
      ? 'M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8Z'
      : 'M21 12.8a9 9 0 1 1-9.8-9 7 7 0 0 0 9.8 9z'
  )
  svg.append(path)
  return svg
}

const writeLocalStorageValue = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Ignore storage failures in private mode.
  }
}

const setThemeCookie = (value: Theme) => {
  document.cookie = `${STATIC_THEME_COOKIE_KEY}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`
}

const setDocumentTheme = (value: Theme) => {
  document.documentElement.dataset.theme = value
  document.documentElement.style.colorScheme = value
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute('content', value === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR)
  }
}

const persistStaticTheme = (value: Theme) => {
  setDocumentTheme(value)
  writeLocalStorageValue(STATIC_THEME_STORAGE_KEY, value)
  writeLocalStorageValue(STATIC_THEME_PREFERENCE_KEY, value)
  setThemeCookie(value)
}

const refreshThemeButton = (lang: Lang) => {
  const button = document.querySelector<HTMLButtonElement>('[data-static-theme-toggle]')
  if (!button) return

  const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  const copy = getStaticHomeUiCopy(lang)
  button.dataset.theme = theme
  button.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false')
  button.setAttribute('aria-label', theme === 'dark' ? copy.themeAriaToLight : copy.themeAriaToDark)
  button.replaceChildren(createThemeIcon(theme))
}

export const bindHomeUiControls = ({ controller, onLanguageChange }: BindHomeUiControlsOptions) => {
  const settingsRoot = document.querySelector<HTMLElement>('.topbar-settings')
  const settingsToggle = document.querySelector<HTMLButtonElement>('[data-static-settings-toggle]')
  const settingsPanel = document.querySelector<HTMLElement>('.settings-dropdown')
  const languageMenuToggle = document.querySelector<HTMLButtonElement>('[data-static-language-menu-toggle]')
  const languageDrawer = document.querySelector<HTMLElement>('.settings-lang-drawer')
  const themeToggle = document.querySelector<HTMLButtonElement>('[data-static-theme-toggle]')

  if (!settingsRoot || !settingsToggle || !settingsPanel || !themeToggle) {
    return false
  }
  if (settingsRoot.getAttribute(UI_CONTROLS_BOUND_ATTR) === 'true') {
    refreshThemeButton(controller.lang)
    return true
  }

  settingsRoot.setAttribute(UI_CONTROLS_BOUND_ATTR, 'true')

  const closeLanguageMenu = (restoreFocus = false) => {
    const wasOpen = languageDrawer?.dataset.open === 'true'
    if (restoreFocus && wasOpen && languageMenuToggle) {
      restoreOverlayFocusBeforeHide(languageDrawer, languageMenuToggle)
    }
    setOverlaySurfaceState(languageDrawer, false)
    if (languageMenuToggle) {
      languageMenuToggle.setAttribute('aria-expanded', 'false')
    }
  }

  const closeMenus = (restoreFocus = false) => {
    const wasOpen = settingsRoot.dataset.open === 'true'
    settingsRoot.dataset.open = 'false'
    settingsToggle.setAttribute('aria-expanded', 'false')
    closeLanguageMenu(false)
    if (restoreFocus && wasOpen) {
      restoreOverlayFocusBeforeHide(settingsPanel, settingsToggle)
    }
    setOverlaySurfaceState(settingsPanel, false)
  }

  const toggleSettings = () => {
    const next = settingsRoot.dataset.open !== 'true'
    settingsRoot.dataset.open = next ? 'true' : 'false'
    settingsToggle.setAttribute('aria-expanded', next ? 'true' : 'false')
    if (!next) {
      closeMenus(false)
      return
    }
    setOverlaySurfaceState(settingsPanel, true)
    focusOverlayEntry(settingsPanel, languageMenuToggle ?? themeToggle)
  }

  const toggleLanguageMenu = () => {
    if (!languageDrawer || !languageMenuToggle) return

    const next = languageDrawer.dataset.open !== 'true'
    setOverlaySurfaceState(languageDrawer, next)
    languageMenuToggle.setAttribute('aria-expanded', next ? 'true' : 'false')
    if (next) {
      focusOverlayEntry(languageDrawer, [
        'input[name="static-topbar-language"]:checked',
        'input[name="static-topbar-language"]'
      ])
      return
    }
    restoreOverlayFocusBeforeHide(languageDrawer, languageMenuToggle)
    setOverlaySurfaceState(languageDrawer, false)
  }

  const handleThemeClick = () => {
    const nextTheme: Theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
    persistStaticTheme(nextTheme)
    refreshThemeButton(controller.lang)
  }

  settingsToggle.addEventListener('click', toggleSettings)
  themeToggle.addEventListener('click', handleThemeClick)
  controller.cleanupFns.push(() => settingsToggle.removeEventListener('click', toggleSettings))
  controller.cleanupFns.push(() => themeToggle.removeEventListener('click', handleThemeClick))
  controller.cleanupFns.push(
    bindOverlayDismiss({
      root: settingsRoot,
      onDismiss: () => {
        if (settingsRoot.dataset.open !== 'true' && languageDrawer?.dataset.open !== 'true') {
          return
        }
        closeMenus(true)
      }
    })
  )

  if (languageMenuToggle && languageDrawer) {
    languageMenuToggle.addEventListener('click', toggleLanguageMenu)
    controller.cleanupFns.push(() => languageMenuToggle.removeEventListener('click', toggleLanguageMenu))
  }

  document.querySelectorAll<HTMLInputElement>('[data-static-language-option]').forEach((input) => {
    const handleChange = () => {
      const nextLang = input.dataset.lang as Lang | undefined
      input.blur()
      const finalizeLanguageChange = () => {
        closeMenus(true)
        if (!nextLang || nextLang === controller.lang) {
          return
        }
        void onLanguageChange(nextLang)
      }
      if (typeof queueMicrotask === 'function') {
        queueMicrotask(finalizeLanguageChange)
        return
      }
      finalizeLanguageChange()
    }

    input.addEventListener('change', handleChange)
    controller.cleanupFns.push(() => input.removeEventListener('change', handleChange))
  })

  controller.cleanupFns.push(() => {
    if (settingsRoot.getAttribute(UI_CONTROLS_BOUND_ATTR) === 'true') {
      settingsRoot.removeAttribute(UI_CONTROLS_BOUND_ATTR)
    }
  })

  setOverlaySurfaceState(settingsPanel, false)
  closeLanguageMenu(false)
  refreshThemeButton(controller.lang)
  return true
}
