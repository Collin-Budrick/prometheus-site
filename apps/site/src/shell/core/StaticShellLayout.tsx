import { Slot, component$ } from '@builder.io/qwik'
import type { Theme } from '@prometheus/ui'
import { InSettings } from '@qwikest/icons/iconoir'
import { emptyUiCopy, type LanguageSeedPayload } from '../../lang/selection'
import type { Lang } from '../../lang'
import { supportedLanguages } from '../../lang/manifest'
import { appConfig, siteTemplateConfig } from '../../site-config'
import { AUTH_NAV_ITEMS, TOPBAR_NAV_ITEMS } from '../../shared/nav-order'
import { createDockRouteDescriptors } from '../../shared/route-navigation'
import {
  buildRouteShellBootstrapScript,
  type RouteShellBootstrapDescriptor
} from '../../shared/route-shell-bootstrap'
import { useCspNonce } from '../../security/qwik'
import {
  FRAGMENT_STATIC_ROUTE_KIND,
  HOME_STATIC_ROUTE_KIND,
  ISLAND_STATIC_ROUTE_KIND,
  STATIC_DOCK_ROOT_ATTR,
  STATIC_ROUTE_ATTR,
  STATIC_SHELL_DOCK_REGION,
  STATIC_SHELL_HEADER_REGION,
  STATIC_SHELL_MAIN_REGION,
  STATIC_SHELL_REGION_ATTR,
  STATIC_SHELL_SEED_SCRIPT_ID,
  getStaticShellRouteConfig
} from './constants'
import { getLangLabel, renderStaticBrand, StaticDockMarkup, withLangParam } from './dock'
import type { StaticShellSeed } from './seed'

type StaticShellLayoutProps = {
  currentPath: string
  isAuthenticated: boolean
  lang: Lang
  theme: Theme
  languageSeed: LanguageSeedPayload
  buildVersion?: string | null
  routeKind?: typeof HOME_STATIC_ROUTE_KIND | typeof FRAGMENT_STATIC_ROUTE_KIND | typeof ISLAND_STATIC_ROUTE_KIND
}

const serializeJson = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
const serializeInlineScriptAssignment = (target: string, value: unknown) =>
  `${target}=${serializeJson(value)};`
const omitUndefined = <T extends Record<string, unknown>>(value: T): Partial<T> =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>

const StaticShellSettingsOverlay = component$<{
  lang: Lang
  theme: Theme
  copy: typeof emptyUiCopy
}>(({ lang, theme, copy }) => {
  const hasMultipleLangs = supportedLanguages.length > 1
  const themeLabel = theme === 'dark' ? copy.themeAriaToLight : copy.themeAriaToDark

  return (
    <div
      class="settings-dropdown"
      id="topbar-settings-menu"
      role="dialog"
      aria-modal="false"
      aria-labelledby="topbar-settings-heading"
      aria-label={copy.navSettings}
      data-open="false"
      hidden
      aria-hidden="true"
      inert
    >
      <h2 class="settings-panel-title" id="topbar-settings-heading" aria-label={copy.navSettings}>
        {copy.navSettings}
      </h2>
      <div class="settings-controls">
        {hasMultipleLangs ? (
          <button
            type="button"
            class="lang-toggle settings-lang-trigger"
            data-lang={lang}
            aria-expanded="false"
            aria-label={copy.languageToggleLabel}
            aria-controls="topbar-settings-language-panel"
            data-static-language-menu-toggle
          >
            <span class="lang-toggle-icon" aria-hidden="true">
              A
            </span>
          </button>
        ) : null}
        <button
          class="theme-toggle"
          type="button"
          data-theme={theme}
          aria-pressed={theme === 'dark' ? 'true' : 'false'}
          aria-label={themeLabel}
          data-static-theme-toggle
        >
          <span class="theme-toggle-icon" aria-hidden="true">
            {theme === 'dark' ? '☼' : '◐'}
          </span>
        </button>
      </div>
      {hasMultipleLangs ? (
        <div
          class="settings-lang-drawer"
          id="topbar-settings-language-panel"
          data-open="false"
          hidden
          aria-hidden="true"
          aria-labelledby="topbar-settings-heading"
          inert
        >
          <fieldset class="settings-lang-list">
            <legend class="sr-only">{copy.languageToggleLabel}</legend>
            {supportedLanguages.map((language) => {
              const isActive = language === lang
              return (
                <label
                  key={language}
                  class="settings-lang-option"
                  data-active={isActive ? 'true' : 'false'}
                >
                  <input
                    class="settings-lang-input"
                    type="radio"
                    name="static-topbar-language"
                    checked={isActive}
                    data-static-language-option
                    data-lang={language}
                  />
                  <span class="settings-lang-code">{getLangLabel(language)}</span>
                </label>
              )
            })}
          </fieldset>
        </div>
      ) : null}
    </div>
  )
})

export const StaticShellLayout = component$<StaticShellLayoutProps>(({
  currentPath,
  isAuthenticated,
  lang,
  theme,
  languageSeed,
  buildVersion = null,
  routeKind = FRAGMENT_STATIC_ROUTE_KIND
}) => {
  const nonce = useCspNonce()
  const routeConfig = getStaticShellRouteConfig(currentPath)
  const resolvedRouteKind = routeConfig?.routeKind ?? routeKind
  const shellSeed: StaticShellSeed = {
    lang,
    currentPath,
    languageSeed,
    bootstrapMode: routeConfig?.bootstrapMode ?? 'fragment-static',
    authPolicy: routeConfig?.authPolicy ?? 'public',
    isAuthenticated,
    snapshotKey: routeConfig?.snapshotKey ?? currentPath,
    buildVersion
  }
  const copy = {
    ...emptyUiCopy,
    ...omitUndefined(languageSeed.ui ?? {})
  }
  const navItems = isAuthenticated ? AUTH_NAV_ITEMS : TOPBAR_NAV_ITEMS
  const routeBootstrapDescriptors: RouteShellBootstrapDescriptor[] = createDockRouteDescriptors(navItems).map((descriptor) => ({
    href: withLangParam(descriptor.href, lang),
    rootHref: descriptor.href,
    index: descriptor.index,
    safety: descriptor.safety
  }))

  return (
    <div
      class="layout-shell"
      {...{
        [STATIC_ROUTE_ATTR]: resolvedRouteKind
      }}
      data-static-lang={lang}
      data-static-template-preset={siteTemplateConfig.preset}
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
                aria-haspopup="dialog"
                aria-expanded="false"
                aria-label={copy.navSettings}
                aria-controls="topbar-settings-menu"
                data-static-settings-toggle
              >
                <InSettings class="settings-trigger-icon" aria-hidden="true" />
              </button>
              <StaticShellSettingsOverlay lang={lang} theme={theme} copy={copy} />
            </div>
          </div>
        </div>
        <script
          nonce={nonce || undefined}
          dangerouslySetInnerHTML={serializeInlineScriptAssignment('globalThis.__PUBLIC_APP_CONFIG__', appConfig)}
        />
        <script
          id={STATIC_SHELL_SEED_SCRIPT_ID}
          type="application/json"
          nonce={nonce || undefined}
          dangerouslySetInnerHTML={serializeJson(shellSeed)}
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
        data-static-dock-lang={lang}
        data-static-dock-mode={isAuthenticated ? 'auth' : 'public'}
        data-static-dock-path={currentPath}
      >
        <StaticDockMarkup
          lang={lang}
          currentPath={currentPath}
          copy={copy}
          isAuthenticated={isAuthenticated}
        />
      </div>
      <script
        nonce={nonce || undefined}
        dangerouslySetInnerHTML={buildRouteShellBootstrapScript(routeBootstrapDescriptors)}
      />
    </div>
  )
})
