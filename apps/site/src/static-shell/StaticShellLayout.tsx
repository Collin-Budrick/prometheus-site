import { Slot, component$ } from '@builder.io/qwik'
import type { Theme } from '@prometheus/ui'
import { InSettings } from '@qwikest/icons/iconoir'
import { emptyUiCopy, type LanguageSeedPayload } from '../lang/selection'
import type { Lang } from '../lang'
import { supportedLanguages } from '../lang/manifest'
import {
  HOME_STATIC_ROUTE_KIND,
  STATIC_DOCK_ROOT_ATTR,
  STATIC_ROUTE_ATTR,
  STATIC_SHELL_DOCK_REGION,
  STATIC_SHELL_HEADER_REGION,
  STATIC_SHELL_MAIN_REGION,
  STATIC_SHELL_REGION_ATTR,
  STATIC_SHELL_SEED_SCRIPT_ID
} from './constants'
import { getLangLabel, renderStaticBrand, StaticDockMarkup } from './dock'
import { MoonIcon, SunIcon, TranslateIcon } from './icons'

type StaticShellLayoutProps = {
  currentPath: string
  lang: Lang
  theme: Theme
  languageSeed: LanguageSeedPayload
}

const serializeJson = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')

export const StaticShellLayout = component$<StaticShellLayoutProps>(({ currentPath, lang, theme, languageSeed }) => {
  const copy = {
    ...emptyUiCopy,
    ...(languageSeed.ui ?? {})
  }

  return (
    <div
      class="layout-shell"
      {...{
        [STATIC_ROUTE_ATTR]: HOME_STATIC_ROUTE_KIND
      }}
      data-static-lang={lang}
    >
      <header
        class="topbar"
        data-view-transition="shell-header"
        {...{
          [STATIC_SHELL_REGION_ATTR]: STATIC_SHELL_HEADER_REGION
        }}
      >
        {renderStaticBrand()}
        <div class="topbar-actions">
          <div class="topbar-controls">
            <div class="topbar-settings" data-open="false">
              <div
                class="fragment-status"
                data-state="idle"
                role="status"
                aria-live="polite"
                aria-label={copy.fragmentStatusIdle}
                data-static-fragment-status
              >
                <span class="dot" aria-hidden="true" />
              </div>
              <button
                class="settings-trigger"
                type="button"
                aria-haspopup="menu"
                aria-expanded="false"
                aria-label={copy.navSettings}
                aria-controls="topbar-settings-menu"
                data-static-settings-toggle
              >
                <InSettings class="settings-trigger-icon" aria-hidden="true" />
              </button>
              <div class="settings-dropdown" id="topbar-settings-menu" role="menu">
                <div class="settings-controls">
                  {supportedLanguages.length > 1 ? (
                    <button
                      type="button"
                      class="lang-toggle settings-lang-trigger"
                      data-lang={lang}
                      aria-pressed="false"
                      aria-label={copy.languageToggleLabel}
                      data-static-language-menu-toggle
                    >
                      <TranslateIcon />
                    </button>
                  ) : null}
                  <button
                    class="theme-toggle"
                    type="button"
                    data-theme={theme}
                    aria-pressed={theme === 'dark' ? 'true' : 'false'}
                    aria-label={theme === 'dark' ? copy.themeAriaToLight : copy.themeAriaToDark}
                    data-static-theme-toggle
                  >
                    {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
                  </button>
                </div>
                {supportedLanguages.length > 1 ? (
                  <div class="settings-lang-drawer" data-open="false">
                    <div class="settings-lang-list" role="menu">
                      {supportedLanguages.map((langOption) => {
                        const isActive = lang === langOption
                        return (
                          <button
                            key={langOption}
                            type="button"
                            role="menuitemradio"
                            aria-checked={isActive}
                            class="settings-lang-option"
                            data-active={isActive ? 'true' : 'false'}
                            data-static-language-option
                            data-lang={langOption}
                          >
                            <span class="settings-lang-code">{getLangLabel(langOption)}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        <script
          id={STATIC_SHELL_SEED_SCRIPT_ID}
          type="application/json"
          dangerouslySetInnerHTML={serializeJson({ lang, currentPath, languageSeed })}
        />
      </header>
      <main
        data-motion-root
        data-view-transition="shell-main"
        {...{
          [STATIC_SHELL_REGION_ATTR]: STATIC_SHELL_MAIN_REGION
        }}
      >
        <Slot />
      </main>
      <div
        {...{
          [STATIC_SHELL_REGION_ATTR]: STATIC_SHELL_DOCK_REGION,
          [STATIC_DOCK_ROOT_ATTR]: 'true'
        }}
      >
        <StaticDockMarkup
          lang={lang}
          currentPath={currentPath}
          copy={copy}
          isAuthenticated={false}
        />
      </div>
    </div>
  )
})
