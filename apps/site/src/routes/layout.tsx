import { $, component$, HTMLFragment, Slot, useOnDocument, useSignal } from '@builder.io/qwik'
import { Link, routeLoader$, useDocumentHead, useLocation, type DocumentHead, type DocumentHeadProps, type RequestHandler } from '@builder.io/qwik-city'
import { DockBar, DockIcon, LanguageToggle, ThemeToggle, defaultTheme, readThemeFromCookie } from '@prometheus/ui'
import { InChatLines, InDashboard, InFlask, InHomeSimple, InSettings, InShop, InUser, InUserCircle } from '@qwikest/icons/iconoir'
import { siteBrand, type NavLabelKey } from '../config'
import { PUBLIC_CACHE_CONTROL } from '../cache-control'
import { useSharedFragmentStatusSignal } from '@core/fragments'
import { useLangCopy, useProvideLangSignal } from '../shared/lang-bridge'
import { AUTH_NAV_ITEMS, TOPBAR_NAV_ITEMS } from '../shared/nav-order'
import { applyLang, resolveLangParam, supportedLangs, type Lang } from '../shared/lang-store'
import { runLangViewTransition } from '../shared/view-transitions'
import { loadAuthSession, type AuthSessionState } from '../shared/auth-session'
import { resolveRequestLang } from './fragment-resource'
import { appConfig } from '../app-config'
import { buildFragmentCssLinks } from '../fragment/fragment-css'
import { fragmentPlanCache } from '../fragment/plan-cache'
import type { FragmentPlan } from '../fragment/types'
import { setPreference } from '../native/preferences'

const escapeAttr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

const buildStylesheetPreloadMarkup = (href: string, crossorigin?: string | null, fragmentId?: string) => {
  const escapedHref = escapeAttr(href)
  const crossoriginAttr = crossorigin ? ` crossorigin="${escapeAttr(crossorigin)}"` : ''
  const fragmentAttr = fragmentId ? ` data-fragment-css="${escapeAttr(fragmentId)}"` : ''
  return `<link rel="preload" as="style" href="${escapedHref}"${crossoriginAttr}${fragmentAttr} onload="this.onload=null;this.rel='stylesheet'">`
}

const initialFadeDurationMs = 920
const initialFadeClearDelayMs = initialFadeDurationMs + 200
const initialCriticalLiteClearDelayMs = 1200
const LANG_PREFETCH_PARAM = 'lang'

const initialFadeStyle = `:root[data-initial-fade='ready'] .layout-shell {
  opacity: 0;
  animation: page-fade-in ${initialFadeDurationMs}ms cubic-bezier(0.4, 0, 0.2, 1) both;
}
@keyframes page-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  :root[data-initial-fade='ready'] .layout-shell {
    opacity: 1;
    animation: none;
  }
}`

const initialFadeScript = `(function () {
  var root = document.documentElement;
  if (!root) return;
  var clearCriticalLite = function () {
    root.removeAttribute('data-critical-lite');
  };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(clearCriticalLite, { timeout: ${initialCriticalLiteClearDelayMs} });
  } else {
    window.setTimeout(clearCriticalLite, ${initialCriticalLiteClearDelayMs});
  }
  if (root.getAttribute('data-initial-fade') !== 'ready') return;
  var cleared = false;
  var shell = null;
  var clear = function () {
    if (cleared) return;
    cleared = true;
    root.removeAttribute('data-initial-fade');
    if (shell) {
      shell.removeEventListener('animationend', handleEnd);
    }
  };
  var handleEnd = function (event) {
    if (event && event.target !== shell) return;
    clear();
  };
  var attachEnd = function () {
    if (shell) return;
    shell = document.querySelector('.layout-shell');
    if (shell) {
      shell.addEventListener('animationend', handleEnd, { once: true });
    }
  };
  var start = function () {
    if (cleared) return;
    attachEnd();
    window.setTimeout(clear, ${initialFadeClearDelayMs});
  };
  var schedule = function () { window.requestAnimationFrame(start); };
  schedule();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachEnd, { once: true });
  }
})();`

const buildInitialFadeStyleMarkup = () => `<style>${initialFadeStyle}</style>`
const buildInitialFadeScriptMarkup = () => `<script>${initialFadeScript}</script>`
const themeBootstrapScript = `(function () {
  if (typeof window === 'undefined') return;
  var root = document.documentElement;
  if (!root) return;
  var theme = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  if (root.getAttribute('data-theme') !== theme) {
    root.setAttribute('data-theme', theme);
  }
  root.style.colorScheme = theme;
})();`
const buildThemeBootstrapScriptMarkup = () => `<script>${themeBootstrapScript}</script>`

type EarlyHint = {
  href: string
  as?: string
  rel?: 'preload' | 'modulepreload'
  type?: string
  crossorigin?: boolean
}

const shouldSkipEarlyHint = (hint: EarlyHint) => {
  const href = hint.href?.trim()
  if (!href) return true
  if (href.includes('/fragments') || href.includes('webtransport')) return true
  if (hint.rel === 'modulepreload') return true
  return false
}

const buildEarlyHintHeader = (hint: EarlyHint) => {
  if (shouldSkipEarlyHint(hint)) return null
  if (hint.rel === 'modulepreload') {
    let value = `<${hint.href}>; rel=modulepreload`
    if (hint.crossorigin) value += '; crossorigin'
    return value
  }
  const asValue = hint.as?.trim()
  if (!asValue) return null
  let value = `<${hint.href}>; rel=preload; as=${asValue}`
  if (hint.type) value += `; type=${hint.type}`
  if (hint.crossorigin) value += '; crossorigin'
  return value
}

const sanitizeHints = (raw: EarlyHint[]) => {
  const unique = new Map<string, EarlyHint>()
  raw.forEach((hint) => {
    if (!hint?.href) return
    if (!hint.as && hint.rel !== 'modulepreload') return
    if (shouldSkipEarlyHint(hint)) return
    const key = `${hint.href}|${hint.as ?? ''}|${hint.rel ?? ''}|${hint.type ?? ''}|${hint.crossorigin ? '1' : '0'}`
    if (!unique.has(key)) unique.set(key, hint)
  })
  return Array.from(unique.values())
}

const buildPlanEarlyHints = (plan: FragmentPlan | null | undefined) => {
  if (!plan) return []
  const criticalCss = buildFragmentCssLinks(plan, { criticalOnly: true }).map((link) => ({
    href: link.href,
    as: 'style'
  }))
  return [...(plan.earlyHints ?? []), ...criticalCss]
}

const getPlanEarlyHints = (pathName: string, request: Request | null) => {
  if (!request) return []
  const lang = resolveRequestLang(request)
  const cached = fragmentPlanCache.get(pathName, lang)
  const planHints =
    cached?.earlyHints?.length ? cached.earlyHints : cached ? buildPlanEarlyHints(cached.plan) : []
  return sanitizeHints(planHints)
}

const withLangParam = (href: string, langValue: Lang) => {
  if (!href || !href.startsWith('/')) return href
  const base = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
  try {
    const url = new URL(href, base)
    url.searchParams.set(LANG_PREFETCH_PARAM, langValue)
    return `${url.pathname}${url.search}${url.hash}`
  } catch (error) {
    console.warn('Failed to add language param to href:', href, error)
    return href
  }
}

const toPreconnectOrigin = (href: string | undefined, fallbackOrigin: string | null) => {
  if (!href) return null
  if (href.startsWith('http://') || href.startsWith('https://')) {
    try {
      return new URL(href).origin
      } catch (error) {
        console.warn('Failed to resolve preconnect origin:', href, error)
        return null
      }
  }
  return fallbackOrigin
}

const loadNativeHaptics = () => import('../native/haptics')
const loadNativeAffordances = () => import('../native/affordances')

const withUserActionHapticsDeferred = async <T,>(operation: () => Promise<T> | T) => {
  const haptics = await loadNativeHaptics()
  return haptics.withUserActionHaptics(operation)
}

const triggerHapticTapDeferred = async () => {
  const haptics = await loadNativeHaptics()
  await haptics.triggerHapticTap()
}

const triggerHapticSelectionDeferred = async () => {
  const haptics = await loadNativeHaptics()
  await haptics.triggerHapticSelection()
}

const showNativeActionSheetDeferred = async (title: string, options: Array<{ title: string }>) => {
  const affordances = await loadNativeAffordances()
  return affordances.showNativeActionSheet(title, options)
}

const buildTrackingOrigins = (currentOrigin: string | null) => {
  const origins = new Set<string>()
  const addOrigin = (href: string | undefined) => {
    const origin = toPreconnectOrigin(href, currentOrigin)
    if (!origin) return
    origins.add(origin)
  }

  if (appConfig.analytics?.enabled) {
    addOrigin(appConfig.analytics.beaconUrl)
  }

  if (appConfig.highlight?.enabled) {
    addOrigin('https://app.highlight.io')
  }

  return Array.from(origins)
}

const buildPreconnectOrigins = (currentOrigin: string | null, includeTracking: boolean) => {
  const origins = new Set<string>()
  const addOrigin = (href: string | undefined) => {
    const origin = toPreconnectOrigin(href, currentOrigin)
    if (!origin) return
    origins.add(origin)
  }

  addOrigin(appConfig.apiBase)
  if (appConfig.enableFragmentStreaming && (appConfig.preferWebTransport || appConfig.preferWebTransportDatagrams)) {
    addOrigin(appConfig.webTransportBase)
  }

  if (includeTracking) {
    buildTrackingOrigins(currentOrigin).forEach((origin) => origins.add(origin))
  }

  return Array.from(origins)
}

const DOCK_ICONS: Record<NavLabelKey, typeof InHomeSimple> = {
  navHome: InHomeSimple,
  navStore: InShop,
  navLab: InFlask,
  navLogin: InUser,
  navProfile: InUserCircle,
  navChat: InChatLines,
  navSettings: InSettings,
  navDashboard: InDashboard
}

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  ja: '日本語',
  ko: '한국어'
}

const getLangLabel = (value: string) => LANGUAGE_LABELS[value.toLowerCase()] ?? value.toUpperCase()

export const useAuthSession = routeLoader$<AuthSessionState>(async ({ request }) => loadAuthSession(request))

export const useShellPreferences = routeLoader$((event) => {
  const lang = resolveRequestLang(event.request)
  const theme = readThemeFromCookie(event.request.headers.get('cookie')) ?? defaultTheme
  return { lang, theme }
})

export const useInitialFadeState = routeLoader$((_event) => {
  const initialFade = null
  const criticalLite = 'ready'
  return { initialFade, criticalLite }
})

export const onRequest: RequestHandler = async ({ headers, method, request }) => {
  const isCacheableMethod = method === 'GET' || method === 'HEAD'
  const isHtmlRequest = isCacheableMethod && headers.get('Accept')?.includes('text/html')

  if (isHtmlRequest) {
    headers.set('Cache-Control', PUBLIC_CACHE_CONTROL)
  } else if (isCacheableMethod && !headers.has('Cache-Control')) {
    headers.set('Cache-Control', PUBLIC_CACHE_CONTROL)
  }

  if (isHtmlRequest) {
    const pathName = request ? new URL(request.url).pathname : '/'
    const planHints = getPlanEarlyHints(pathName, request ?? null)
    planHints.map(buildEarlyHintHeader).filter((value): value is string => Boolean(value)).forEach((link) => {
      headers.append('Link', link)
    })
  }
}

export const RouterHead = component$(() => {
  const head = useDocumentHead()
  const location = useLocation()
  const initialFade = (head.htmlAttributes as Record<string, string> | undefined)?.['data-initial-fade']
  const currentOrigin = location.url?.origin ?? null
  const trackingOrigins = buildTrackingOrigins(currentOrigin)
  const preconnectOrigins = buildPreconnectOrigins(currentOrigin, false)
  const base = import.meta.env.BASE_URL || '/'
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  const withBase = (path: string) => `${normalizedBase}${path.replace(/^\/+/, '')}`

  return (
    <>
      <title>{head.title}</title>
      {head.meta.map((meta) => (
        <meta key={`${meta.name || meta.property}-${meta.content}`} {...meta} />
      ))}
      {head.links.flatMap((link) => {
        if (link.rel === 'stylesheet' && typeof link.href === 'string') {
          const fragmentId = (link as Record<string, string>)['data-fragment-css']
          return [
            <HTMLFragment
              key={`preload-style-${link.href}`}
              dangerouslySetInnerHTML={buildStylesheetPreloadMarkup(link.href, link.crossorigin, fragmentId)}
            />,
            <noscript key={`noscript-style-${link.href}`}>
              <link {...link} />
            </noscript>
          ]
        }

        return <link key={`${link.rel}-${link.href}`} {...link} />
      })}
      {preconnectOrigins.map((origin) => (
        <link
          key={`preconnect-${origin}`}
          rel="preconnect"
          href={origin}
          crossOrigin={origin !== currentOrigin ? 'anonymous' : undefined}
        />
      ))}
      {trackingOrigins.map((origin) => (
        <link key={`dns-prefetch-${origin}`} rel="dns-prefetch" href={origin} />
      ))}
      {initialFade ? (
        <>
          <HTMLFragment dangerouslySetInnerHTML={buildInitialFadeStyleMarkup()} />
          <HTMLFragment dangerouslySetInnerHTML={buildInitialFadeScriptMarkup()} />
        </>
      ) : null}
      <HTMLFragment dangerouslySetInnerHTML={buildThemeBootstrapScriptMarkup()} />
      <link rel="icon" href={withBase('favicon.svg')} type="image/svg+xml" />
      <link rel="icon" href={withBase('favicon.ico')} sizes="any" />
      <link rel="manifest" href={withBase('manifest.webmanifest')} />
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <meta name="theme-color" content={siteBrand.themeColor} />
      <meta name="theme-color" media="(prefers-color-scheme: dark)" content={siteBrand.themeColor} />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    </>
  )
})

export const head: DocumentHead = ({ resolveValue }: DocumentHeadProps) => {
  const fadeState = resolveValue(useInitialFadeState)
  const htmlAttributes: Record<string, string> = {}
  if (fadeState.initialFade) {
    htmlAttributes['data-initial-fade'] = fadeState.initialFade
  }
  if (fadeState.criticalLite) {
    htmlAttributes['data-critical-lite'] = fadeState.criticalLite
  }
  return {
    htmlAttributes
  }
}

export default component$(() => {
  const shellPreferences = useShellPreferences()
  const langSignal = useProvideLangSignal(shellPreferences.value.lang)
  const copy = useLangCopy(langSignal)
  const fragmentStatus = useSharedFragmentStatusSignal()
  const authSession = useAuthSession()
  const isAuthenticated = authSession.value.status === 'authenticated'
  const settingsOpen = useSignal(false)
  const settingsRef = useSignal<HTMLDivElement>()
  const langMenuOpen = useSignal(false)
  const navItems = isAuthenticated ? AUTH_NAV_ITEMS : TOPBAR_NAV_ITEMS
  const dockItems = navItems.map((item) => {
    const Icon = DOCK_ICONS[item.labelKey] ?? InHomeSimple
    return { href: item.href, label: copy.value[item.labelKey], icon: Icon }
  })
  const statusLabel =
    fragmentStatus.value === 'streaming'
      ? copy.value.fragmentStatusStreaming
      : fragmentStatus.value === 'error'
        ? copy.value.fragmentStatusStalled
        : copy.value.fragmentStatusIdle
  const hasMultipleLangs = supportedLangs.length > 1
  const applyLangChoice = $((next: Lang) => {
    if (langSignal.value === next) return
    if (typeof window !== 'undefined') {
      const currentParam = resolveLangParam(new URLSearchParams(window.location.search).get(LANG_PREFETCH_PARAM))
      if (currentParam !== next) {
        const url = new URL(window.location.href)
        url.searchParams.set(LANG_PREFETCH_PARAM, next)
        const nextUrl = `${url.pathname}${url.search}${url.hash}`
        const state = window.history.state
        const nextState =
          state && typeof state === 'object' ? { ...state } : state == null ? {} : { _data: state }
        window.history.replaceState(nextState, '', nextUrl)
      }
    }
    const root = document.querySelector('.layout-shell') ?? document.body
    void runLangViewTransition(
      () => {
        langSignal.value = next
        applyLang(next)
        void setPreference('locale', next)
      },
      {
        mutationRoot: root,
        timeoutMs: 420,
        variant: 'ui'
      }
    )
  })

  useOnDocument(
    'click',
    $((event: MouseEvent) => {
      if (!settingsOpen.value) return
      const target = event.target as Node | null
      const root = settingsRef.value
      if (!root || !target) return
      if (!root.contains(target)) {
        settingsOpen.value = false
        langMenuOpen.value = false
      }
    })
  )

  useOnDocument(
    'keydown',
    $((event: KeyboardEvent) => {
      if (event.key === 'Escape' && settingsOpen.value) {
        settingsOpen.value = false
        langMenuOpen.value = false
      }
    })
  )

  return (
    <div class="layout-shell">
      <header class="topbar" data-view-transition="shell-header">
        <div class="brand">
          <div class="brand-mark" aria-hidden="true" />
          <div class="brand-title">
            <strong>{siteBrand.name}</strong>
            <span>{siteBrand.product}</span>
          </div>
        </div>
        <div class="topbar-actions">
          <div class="topbar-controls">
            <div class="topbar-settings" ref={settingsRef} data-open={settingsOpen.value ? 'true' : 'false'}>
              <button
                class="settings-trigger"
                type="button"
                aria-haspopup="menu"
                aria-expanded={settingsOpen.value ? 'true' : 'false'}
                aria-label={copy.value.navSettings}
                aria-controls="topbar-settings-menu"
                onClick$={$(() => withUserActionHapticsDeferred(async () => {
                  await triggerHapticTapDeferred()
                  const next = !settingsOpen.value
                  settingsOpen.value = next
                  if (!next) {
                    langMenuOpen.value = false
                  }
                }))}
              >
                <InSettings class="settings-trigger-icon" aria-hidden="true" />
              </button>
              <div class="settings-dropdown" id="topbar-settings-menu" role="menu">
                {settingsOpen.value ? (
                  <>
                    <div class="settings-controls">
                      <div
                        class="fragment-status"
                        data-state={fragmentStatus.value}
                        role="status"
                        aria-live="polite"
                        aria-label={statusLabel}
                      >
                        <span class="dot" aria-hidden="true" />
                      </div>
                      {hasMultipleLangs ? (
                        <LanguageToggle
                          class="settings-lang-trigger"
                          lang={langSignal}
                          ariaLabel={copy.value.languageToggleLabel}
                          pressed={langMenuOpen.value}
                          onToggle$={$(() => withUserActionHapticsDeferred(async () => {
                            await triggerHapticSelectionDeferred()
                            const selectedIndex = await showNativeActionSheetDeferred(copy.value.languageToggleLabel, supportedLangs.map((item) => ({ title: getLangLabel(item) })))
                            if (selectedIndex !== null && selectedIndex >= 0 && selectedIndex < supportedLangs.length) {
                              const selected = supportedLangs[selectedIndex] as Lang
                              void applyLangChoice(selected)
                              return
                            }
                            langMenuOpen.value = !langMenuOpen.value
                          }))}
                        />
                      ) : null}
                      <ThemeToggle
                        initialTheme={shellPreferences.value.theme}
                        labels={{ ariaToDark: copy.value.themeAriaToDark, ariaToLight: copy.value.themeAriaToLight }}
                        onToggle$={$((nextTheme) => {
                          void withUserActionHapticsDeferred(async () => {
                            await triggerHapticTapDeferred()
                            await setPreference('theme', nextTheme)
                          })
                        })}
                      />
                    </div>
                    {hasMultipleLangs ? (
                      <div class="settings-lang-drawer" data-open={langMenuOpen.value ? 'true' : 'false'}>
                        <div class="settings-lang-list" role="menu">
                          {supportedLangs.map((langOption) => {
                            const langValue = langOption as Lang
                            const isActive = langSignal.value === langValue
                            return (
                              <button
                                key={langOption}
                                type="button"
                                role="menuitemradio"
                                aria-checked={isActive}
                                class="settings-lang-option"
                                data-active={isActive ? 'true' : 'false'}
                                onClick$={$(() => {
                                  void applyLangChoice(langValue)
                                  langMenuOpen.value = false
                                })}
                              >
                                <span class="settings-lang-code">{getLangLabel(langOption)}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </header>
      <main data-motion-root data-view-transition="shell-main">
        <Slot />
      </main>
      <DockBar
        ariaLabel={copy.value.dockAriaLabel}
        dockMode={isAuthenticated ? 'auth' : 'public'}
        dockCount={dockItems.length}
      >
        {dockItems.map(({ href, label, icon: Icon }, index) => {
          const langHref = withLangParam(href, langSignal.value)
          return (
            <DockIcon key={href} label={label}>
              <Link
                class="dock-link"
                href={langHref}
                prefetch={false}
                data-fragment-link
                aria-label={label}
                title={label}
                style={{ '--dock-index': `${index}` }}
              >
                <Icon class="dock-icon-svg" aria-hidden="true" />
              </Link>
            </DockIcon>
          )
        })}
      </DockBar>
    </div>
  )
})
