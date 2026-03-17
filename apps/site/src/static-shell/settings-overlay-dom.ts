import { supportedLanguages } from '../lang/manifest'
import type { Lang } from '../lang/types'

type Theme = 'light' | 'dark'

type StaticShellSettingsCopy = {
  navSettings: string
  languageToggleLabel: string
  themeAriaToLight: string
  themeAriaToDark: string
}

type StaticShellSettingsOverlay = {
  settingsPanel: HTMLElement
  languageMenuToggle: HTMLButtonElement | null
  languageDrawer: HTMLElement | null
  themeToggle: HTMLButtonElement
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  ja: '\u65e5\u672c\u8a9e',
  ko: '\ud55c\uad6d\uc5b4'
}

const createSvgIcon = (pathData: string, className: string) => {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg')
  svg.setAttribute('class', className)
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
  path.setAttribute('d', pathData)
  svg.append(path)
  return svg
}

const getLangLabel = (value: string) =>
  LANGUAGE_LABELS[value.toLowerCase()] ?? value.toUpperCase()

export const readStaticShellTheme = (): Theme =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'

export const createStaticShellTranslateIcon = () =>
  createSvgIcon(
    'M4 5h12M10 5a17.3 17.3 0 0 1-4 10M6 15c1.8-1 3.6-2.7 5-5M14 19l4-9 4 9M15.5 16h5',
    'lang-toggle-icon'
  )

export const createStaticShellThemeIcon = (theme: Theme) =>
  createSvgIcon(
    theme === 'dark'
      ? 'M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8Z'
      : 'M21 12.8a9 9 0 1 1-9.8-9 7 7 0 0 0 9.8 9z',
    'theme-toggle-icon'
  )

const createLanguageOption = ({
  lang,
  currentLang
}: {
  lang: Lang
  currentLang: Lang
}) => {
  const label = document.createElement('label')
  const isActive = lang === currentLang
  label.className = 'settings-lang-option'
  label.dataset.active = isActive ? 'true' : 'false'

  const input = document.createElement('input')
  input.className = 'settings-lang-input'
  input.type = 'radio'
  input.name = 'static-topbar-language'
  input.checked = isActive
  input.dataset.staticLanguageOption = ''
  input.dataset.lang = lang

  const text = document.createElement('span')
  text.className = 'settings-lang-code'
  text.textContent = getLangLabel(lang)

  label.append(input, text)
  return label
}

export const ensureStaticShellSettingsOverlay = ({
  settingsRoot,
  lang,
  copy,
  theme = readStaticShellTheme()
}: {
  settingsRoot: HTMLElement
  lang: Lang
  copy: StaticShellSettingsCopy
  theme?: Theme
}): StaticShellSettingsOverlay | null => {
  const existingPanel = settingsRoot.querySelector<HTMLElement>('.settings-dropdown')
  const existingThemeToggle = settingsRoot.querySelector<HTMLButtonElement>('[data-static-theme-toggle]')
  if (existingPanel && existingThemeToggle) {
    return {
      settingsPanel: existingPanel,
      languageMenuToggle: settingsRoot.querySelector<HTMLButtonElement>('[data-static-language-menu-toggle]'),
      languageDrawer: settingsRoot.querySelector<HTMLElement>('.settings-lang-drawer'),
      themeToggle: existingThemeToggle
    }
  }

  const settingsPanel = document.createElement('div')
  settingsPanel.className = 'settings-dropdown'
  settingsPanel.id = 'topbar-settings-menu'
  settingsPanel.setAttribute('role', 'dialog')
  settingsPanel.setAttribute('aria-modal', 'false')
  settingsPanel.setAttribute('aria-labelledby', 'topbar-settings-heading')
  settingsPanel.dataset.open = 'false'
  settingsPanel.hidden = true
  settingsPanel.setAttribute('aria-hidden', 'true')
  settingsPanel.setAttribute('inert', '')

  const heading = document.createElement('h2')
  heading.className = 'sr-only'
  heading.id = 'topbar-settings-heading'
  heading.textContent = copy.navSettings

  const controls = document.createElement('div')
  controls.className = 'settings-controls'

  let languageMenuToggle: HTMLButtonElement | null = null
  let languageDrawer: HTMLElement | null = null
  if (supportedLanguages.length > 1) {
    languageMenuToggle = document.createElement('button')
    languageMenuToggle.type = 'button'
    languageMenuToggle.className = 'lang-toggle settings-lang-trigger'
    languageMenuToggle.dataset.lang = lang
    languageMenuToggle.setAttribute('aria-expanded', 'false')
    languageMenuToggle.setAttribute('aria-label', copy.languageToggleLabel)
    languageMenuToggle.setAttribute('aria-controls', 'topbar-settings-language-panel')
    languageMenuToggle.dataset.staticLanguageMenuToggle = ''
    languageMenuToggle.append(createStaticShellTranslateIcon())
    controls.append(languageMenuToggle)
  }

  const themeToggle = document.createElement('button')
  themeToggle.className = 'theme-toggle'
  themeToggle.type = 'button'
  themeToggle.dataset.theme = theme
  themeToggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false')
  themeToggle.setAttribute(
    'aria-label',
    theme === 'dark' ? copy.themeAriaToLight : copy.themeAriaToDark
  )
  themeToggle.dataset.staticThemeToggle = ''
  themeToggle.append(createStaticShellThemeIcon(theme))
  controls.append(themeToggle)

  settingsPanel.append(heading, controls)

  if (supportedLanguages.length > 1) {
    languageDrawer = document.createElement('div')
    languageDrawer.className = 'settings-lang-drawer'
    languageDrawer.id = 'topbar-settings-language-panel'
    languageDrawer.dataset.open = 'false'
    languageDrawer.hidden = true
    languageDrawer.setAttribute('aria-hidden', 'true')
    languageDrawer.setAttribute('aria-labelledby', 'topbar-settings-heading')
    languageDrawer.setAttribute('inert', '')

    const fieldset = document.createElement('fieldset')
    fieldset.className = 'settings-lang-list'

    const legend = document.createElement('legend')
    legend.className = 'sr-only'
    legend.textContent = copy.languageToggleLabel
    fieldset.append(legend)

    supportedLanguages.forEach((language) => {
      fieldset.append(createLanguageOption({ lang: language, currentLang: lang }))
    })

    languageDrawer.append(fieldset)
    settingsPanel.append(languageDrawer)
  }

  settingsRoot.append(settingsPanel)
  return {
    settingsPanel,
    languageMenuToggle,
    languageDrawer,
    themeToggle
  }
}
