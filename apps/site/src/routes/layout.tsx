import { $, component$, HTMLFragment, Slot, useOnDocument, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { Link, routeLoader$, useDocumentHead, useLocation, type DocumentHead, type DocumentHeadProps, type RequestHandler } from '@builder.io/qwik-city'
import { DockBar, DockIcon, LanguageToggle, ThemeToggle, defaultTheme, readThemeFromCookie } from '@prometheus/ui'
import { InChatLines, InDashboard, InFlask, InHomeSimple, InSettings, InShop, InUser, InUserCircle } from '@qwikest/icons/iconoir'
import { siteBrand, type NavLabelKey } from '../config'
import { PUBLIC_CACHE_CONTROL } from '../cache-control'
import { useSharedFragmentStatusSignal } from '@core/fragments'
import { useLangCopy, useProvideLangSignal } from '../shared/lang-bridge'
import { AUTH_NAV_ITEMS, TOPBAR_NAV_ITEMS, TOPBAR_ROUTE_ORDER } from '../shared/nav-order'
import { applyLang, resolveLangParam, supportedLangs, type Lang } from '../shared/lang-store'
import { runLangViewTransition } from '../shared/view-transitions'
import { loadAuthSession, type AuthSessionState } from '../shared/auth-session'
import { resolveRequestLang } from './fragment-resource'

const buildStylesheetPreloadMarkup = (href: string, crossorigin?: string | null) => {
  const escapedHref = href.replace(/&/g, '&amp;')
  const crossoriginAttr = crossorigin ? ` crossorigin="${crossorigin}"` : ''
  return `<link rel="preload" as="style" href="${escapedHref}"${crossoriginAttr} onload="this.onload=null;this.rel='stylesheet'">`
}

const initialFadeDurationMs = 920
const initialFadeClearDelayMs = initialFadeDurationMs + 200
const initialCardStaggerDurationMs = 2600
const LANG_PREFETCH_PARAM = 'lang'
const CARD_STAGGER_COOKIE_KEY = 'prom-card-stagger'

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
  var staggerAttr = 'data-card-stagger';
  if (root.getAttribute(staggerAttr) === 'ready') {
    window.setTimeout(function () {
      root.removeAttribute(staggerAttr);
    }, ${initialCardStaggerDurationMs});
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

const withLangParam = (href: string, langValue: Lang) => {
  if (!href || !href.startsWith('/')) return href
  const base = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
  try {
    const url = new URL(href, base)
    url.searchParams.set(LANG_PREFETCH_PARAM, langValue)
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return href
  }
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

export const useInitialFadeState = routeLoader$((event) => {
  const cardStaggerSeen = event.cookie.get(CARD_STAGGER_COOKIE_KEY)?.value === '1'
  const cardStagger = cardStaggerSeen ? null : 'ready'
  const initialFade = null

  if (cardStagger) {
    event.cookie.set(CARD_STAGGER_COOKIE_KEY, '1', { path: '/', sameSite: 'lax' })
  }

  return { initialFade, cardStagger }
})

export const onRequest: RequestHandler = ({ headers, method }) => {
  if ((method === 'GET' || method === 'HEAD') && !headers.has('Cache-Control')) {
    headers.set(
      'Cache-Control',
      PUBLIC_CACHE_CONTROL // 0s freshness, allow 60s stale-while-revalidate to keep streams aligned.
    )
  }
}

export const RouterHead = component$(() => {
  const head = useDocumentHead()
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
          return [
            <HTMLFragment
              key={`preload-style-${link.href}`}
              dangerouslySetInnerHTML={buildStylesheetPreloadMarkup(link.href, link.crossorigin)}
            />,
            <noscript key={`noscript-style-${link.href}`}>
              <link {...link} />
            </noscript>
          ]
        }

        return <link key={`${link.rel}-${link.href}`} {...link} />
      })}
      <HTMLFragment dangerouslySetInnerHTML={buildInitialFadeStyleMarkup()} />
      <HTMLFragment dangerouslySetInnerHTML={buildInitialFadeScriptMarkup()} />
      <link rel="icon" href={withBase('favicon.svg')} type="image/svg+xml" />
      <link rel="icon" href={withBase('favicon.ico')} sizes="any" />
      <link rel="manifest" href={withBase('manifest.webmanifest')} />
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
  if (fadeState.cardStagger) {
    htmlAttributes['data-card-stagger'] = fadeState.cardStagger
  }
  return {
    htmlAttributes
  }
}

export default component$(() => {
  const shellPreferences = useShellPreferences()
  const location = useLocation()
  const langSignal = useProvideLangSignal(shellPreferences.value.lang)
  const copy = useLangCopy(langSignal)
  const fragmentStatus = useSharedFragmentStatusSignal()
  const authSession = useAuthSession()
  const isAuthenticated = authSession.value.status === 'authenticated'
  const bannerMode = useSignal<'offline' | 'online' | 'sync' | 'cache-refreshed' | 'cache-cleared' | null>(null)
  const bannerTimeoutId = useSignal<number | null>(null)
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
      },
      {
        mutationRoot: root,
        timeoutMs: 420,
        variant: 'ui'
      }
    )
  })

  useVisibleTask$(
    (ctx) => {
      const search = ctx.track(() => location.url.search)
      if (!search) return
      const next = resolveLangParam(new URLSearchParams(search).get(LANG_PREFETCH_PARAM))
      if (!next || next === langSignal.value) return
      const root = document.querySelector('.layout-shell') ?? document.body
      void runLangViewTransition(
        () => {
          langSignal.value = next
          applyLang(next)
        },
        {
          mutationRoot: root,
          timeoutMs: 420,
          variant: 'ui'
        }
      )
    },
    { strategy: 'document-ready' }
  )


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

  const setBanner = $((mode: typeof bannerMode.value, durationMs?: number) => {
    if (typeof window === 'undefined') return
    if (bannerTimeoutId.value) {
      window.clearTimeout(bannerTimeoutId.value)
      bannerTimeoutId.value = null
    }
    bannerMode.value = mode
    if (mode && durationMs && durationMs > 0) {
      bannerTimeoutId.value = window.setTimeout(() => {
        bannerMode.value = null
        bannerTimeoutId.value = null
      }, durationMs)
    }
  })

  const handleRetrySync = $(() => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('prom:sw-manual-sync'))
    void setBanner('sync', 3200)
  })

  useVisibleTask$((ctx) => {
    const orderedRoutes: readonly string[] = TOPBAR_ROUTE_ORDER
    const normalizePath = (value: string) => value.replace(/\/+$/, '') || '/'

    const handleClick = (event: Event) => {
      if (!(event.target instanceof Element)) return
      const anchor = event.target.closest('a[data-fragment-link]')
      if (!(anchor instanceof HTMLAnchorElement)) return
      const href = anchor.getAttribute('href')
      if (!href) return

      let targetPath = href
      try {
        targetPath = new URL(href, window.location.href).pathname
      } catch {
        return
      }

      const currentPath = normalizePath(window.location.pathname)
      const nextPath = normalizePath(targetPath)
      const currentIndex = orderedRoutes.indexOf(currentPath)
      const targetIndex = orderedRoutes.indexOf(nextPath)
      const root = document.documentElement
      if (currentIndex < 0 || targetIndex < 0 || currentIndex === targetIndex) {
        delete root.dataset.navDirection
      } else {
        root.dataset.navDirection = targetIndex > currentIndex ? 'forward' : 'back'
      }
    }

    document.addEventListener('click', handleClick, { capture: true })
    ctx.cleanup(() => {
      document.removeEventListener('click', handleClick, { capture: true })
    })
  })

  useVisibleTask$((ctx) => {
    if (typeof window === 'undefined') return
    if (navigator.onLine === false) {
      void setBanner('offline')
    }

    const handleOnline = () => {
      void setBanner('online', 4200)
    }
    const handleOffline = () => {
      void setBanner('offline')
    }
    const handleNetworkStatus = (event: Event) => {
      if (!(event instanceof CustomEvent)) return
      const detail = event.detail as { online?: boolean } | undefined
      if (detail?.online === false) {
        handleOffline()
      } else if (detail?.online === true) {
        handleOnline()
      }
    }
    const handleCacheRefreshed = () => {
      void setBanner('cache-refreshed', 4200)
    }
    const handleCacheCleared = () => {
      void setBanner('cache-cleared', 4200)
    }
    const handleSyncRequested = () => {
      void setBanner('sync', 3200)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('prom:network-status', handleNetworkStatus)
    window.addEventListener('prom:sw-cache-refreshed', handleCacheRefreshed)
    window.addEventListener('prom:sw-cache-cleared', handleCacheCleared)
    window.addEventListener('prom:sw-sync-requested', handleSyncRequested)

    ctx.cleanup(() => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('prom:network-status', handleNetworkStatus)
      window.removeEventListener('prom:sw-cache-refreshed', handleCacheRefreshed)
      window.removeEventListener('prom:sw-cache-cleared', handleCacheCleared)
      window.removeEventListener('prom:sw-sync-requested', handleSyncRequested)
    })
  })

  const bannerConfig = (() => {
    if (!bannerMode.value) return null
    switch (bannerMode.value) {
      case 'offline':
        return {
          tone: 'offline',
          title: copy.value.networkOfflineTitle,
          message: copy.value.networkOfflineHint,
          showAction: true
        }
      case 'online':
        return {
          tone: 'online',
          title: copy.value.networkOnlineTitle,
          message: copy.value.networkOnlineHint,
          showAction: true
        }
      case 'sync':
        return {
          tone: 'info',
          title: copy.value.networkSyncTitle,
          message: copy.value.networkSyncQueued,
          showAction: false
        }
      case 'cache-refreshed':
        return {
          tone: 'info',
          title: copy.value.networkCacheRefreshed,
          message: copy.value.networkCacheRefreshedHint,
          showAction: false
        }
      case 'cache-cleared':
        return {
          tone: 'warning',
          title: copy.value.networkCacheCleared,
          message: copy.value.networkCacheClearedHint,
          showAction: false
        }
      default:
        return null
    }
  })()

  return (
    <div class="layout-shell">
      {bannerConfig ? (
        <div class="connection-banner" data-tone={bannerConfig.tone} role="status" aria-live="polite">
          <div class="connection-banner-content">
            <strong>{bannerConfig.title}</strong>
            <span>{bannerConfig.message}</span>
          </div>
          {bannerConfig.showAction ? (
            <button type="button" class="connection-banner-action" onClick$={handleRetrySync}>
              {copy.value.networkRetrySync}
            </button>
          ) : null}
        </div>
      ) : null}
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
                onClick$={() => {
                  const next = !settingsOpen.value
                  settingsOpen.value = next
                  if (!next) {
                    langMenuOpen.value = false
                  }
                }}
              >
                <InSettings class="settings-trigger-icon" aria-hidden="true" />
              </button>
              <div class="settings-dropdown" id="topbar-settings-menu" role="menu">
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
                      onToggle$={$(() => {
                        langMenuOpen.value = !langMenuOpen.value
                      })}
                    />
                  ) : null}
                  <ThemeToggle
                    initialTheme={shellPreferences.value.theme}
                    labels={{ ariaToDark: copy.value.themeAriaToDark, ariaToLight: copy.value.themeAriaToLight }}
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
