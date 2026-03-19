import type { Lang } from '../lang/types'
import {
  bindOverlayDismiss,
  focusOverlayEntry,
  restoreOverlayFocusBeforeHide,
  setOverlaySurfaceState
} from '../shared/overlay-a11y'
import { getStaticHomeUiCopy } from './home-copy-store'
import {
  createStaticShellThemeIcon,
  ensureStaticShellSettingsOverlay,
  ensureStaticShellSettingsPanelContent,
  readStaticShellTheme
} from './settings-overlay-dom'
import { ensureStaticHomeDeferredStylesheet } from './home-deferred-stylesheet'
import { mountStaticSettingsController } from './controllers/settings-static-controller'

type Theme = 'light' | 'dark'

type HomeUiControlsController = {
  cleanupFns: Array<() => void>
  lang: Lang
}

type BindHomeUiControlsOptions = {
  controller: HomeUiControlsController
  onLanguageChange: (nextLang: Lang) => Promise<void> | void
  ensureDeferredStylesheet?: typeof ensureStaticHomeDeferredStylesheet
  ensureSettingsPanelContent?: typeof ensureStaticShellSettingsPanelContent
}

const STATIC_THEME_STORAGE_KEY = 'prometheus-theme'
const STATIC_THEME_COOKIE_KEY = 'prometheus-theme'
const STATIC_THEME_PREFERENCE_KEY = 'prometheus:pref:theme'
const LIGHT_THEME_COLOR = '#f97316'
const DARK_THEME_COLOR = '#0f172a'
const UI_CONTROLS_BOUND_ATTR = 'data-static-home-ui-controls-bound'

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

  const theme = readStaticShellTheme()
  const copy = getStaticHomeUiCopy(lang)
  button.dataset.theme = theme
  button.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false')
  button.setAttribute('aria-label', theme === 'dark' ? copy.themeAriaToLight : copy.themeAriaToDark)
  button.replaceChildren(createStaticShellThemeIcon(theme))
}

export const bindHomeUiControls = ({
  controller,
  onLanguageChange,
  ensureDeferredStylesheet = ensureStaticHomeDeferredStylesheet,
  ensureSettingsPanelContent = ensureStaticShellSettingsPanelContent
}: BindHomeUiControlsOptions) => {
  const settingsRoot = document.querySelector<HTMLElement>('.topbar-settings')
  const settingsToggle = document.querySelector<HTMLButtonElement>('[data-static-settings-toggle]')
  const overlay =
    settingsRoot
      ? ensureStaticShellSettingsOverlay({
          settingsRoot,
          lang: controller.lang,
          copy: getStaticHomeUiCopy(controller.lang)
        })
      : null

  if (!settingsRoot || !settingsToggle || !overlay) {
    return false
  }

  const { settingsPanel, languageMenuToggle, languageDrawer, themeToggle } = overlay
  let settingsPanelContentPromise: Promise<unknown> | null = null
  let settingsControllerCleanup: (() => void) | null = null
  let deferredStylesheetPromise: Promise<unknown> | null = null

  const ensureSettingsContent = () => {
    settingsPanelContentPromise ??= Promise.resolve(
      ensureSettingsPanelContent({
        settingsPanel,
        lang: controller.lang
      })
    ).then(() => {
      if (!settingsControllerCleanup) {
        settingsControllerCleanup = mountStaticSettingsController({
          lang: controller.lang
        }).cleanup
      }
    })
    return settingsPanelContentPromise
  }

  const preloadDeferredStylesheet = () => {
    deferredStylesheetPromise ??= Promise.resolve(
      ensureDeferredStylesheet({ doc: document })
    ).catch((error) => {
      console.error('Static home deferred stylesheet failed:', error)
    })
    return deferredStylesheetPromise
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

  const toggleSettings = async () => {
    const next = settingsRoot.dataset.open !== 'true'
    if (!next) {
      closeMenus(false)
      return
    }
    await preloadDeferredStylesheet()
    void ensureSettingsContent()
    settingsRoot.dataset.open = 'true'
    settingsToggle.setAttribute('aria-expanded', 'true')
    setOverlaySurfaceState(settingsPanel, true)
    focusOverlayEntry(settingsPanel, languageMenuToggle ?? themeToggle)
  }

  const toggleLanguageMenu = async () => {
    if (!languageDrawer || !languageMenuToggle) return

    const next = languageDrawer.dataset.open !== 'true'
    if (next) {
      await preloadDeferredStylesheet()
    }
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
    settingsControllerCleanup?.()
    settingsControllerCleanup = null
  })

  setOverlaySurfaceState(settingsPanel, false)
  closeLanguageMenu(false)
  refreshThemeButton(controller.lang)
  return true
}
