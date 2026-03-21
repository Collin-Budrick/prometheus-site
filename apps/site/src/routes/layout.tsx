import { $, component$, Slot, useSignal, useVisibleTask$, type QRL, type Signal } from '@builder.io/qwik'
import { Link, routeLoader$, useDocumentHead, useLocation, type DocumentHead, type DocumentHeadProps, type RequestHandler } from '@builder.io/qwik-city'
import { DockBar, DockIcon, defaultTheme, readThemeFromCookie } from '@prometheus/ui'
import { InChatLines, InDashboard, InFlask, InHomeSimple, InSettings, InShop, InUser, InUserCircle } from '@qwikest/icons/iconoir'
import { siteBrand, type NavLabelKey } from '../site-config'
import { PUBLIC_CACHE_CONTROL } from '../cache-control'
import { useSharedFragmentStatusSignal } from '@core/fragments'
import { useLangCopy, useLanguageSeed, useProvideLangSignal } from '../shared/lang-bridge'
import { AUTH_NAV_ITEMS, TOPBAR_NAV_ITEMS } from '../shared/nav-order'
import { applyLang, resolveLangParam, supportedLangs, type Lang } from '../shared/lang-store'
import { runLangViewTransition } from '../shared/view-transitions'
import { loadAuthSession, type AuthSessionState } from '../features/auth/auth-session'
import { didAuthSessionChange, revalidateClientAuthSession } from '../features/auth/auth-session-client'
import { resolveRequestLang } from './fragment-resource'
import { appConfig } from '../site-config'
import { buildFragmentCssLinks } from '../fragment/fragment-css'
import { fragmentPlanCache } from '../fragment/plan-cache'
import type { FragmentPlan } from '../fragment/types'
import { appendStaticAssetVersion } from '../shell/core/asset-version'
import { setPreference } from '../native/preferences'
import { loadLanguageResources, prefetchLanguageResources } from '../lang/client'
import { mergeLanguageSelections, resolveRouteLanguageSelection, shellLanguageSelection } from '../lang/selection'
import { useCspNonce } from '../security/qwik'
import { buildSiteCsp, getOrCreateRequestCspNonce } from '../security/server'
import { buildPartytownHeadScript } from '../shared/partytown'
import {
  bindOverlayDismiss,
  focusOverlayEntry,
  restoreOverlayFocusBeforeHide,
  setOverlaySurfaceState
} from '../shared/overlay-a11y'
import { StaticShellLayout } from '../shell/core/StaticShellLayout'
import {
  FRAGMENT_STATIC_ROUTE_KIND,
  HOME_STATIC_ROUTE_KIND,
  HOME_STATIC_ROUTE_PATH,
  getStaticShellRouteConfig,
  isHomeStaticPath,
  isStaticShellPath,
  normalizeStaticShellRoutePath,
  toCanonicalStaticShellHref
} from '../shell/core/constants'
import { homeStaticEagerStylesheetHref } from '../shell/home/home-style-assets'
import {
  HOME_STATIC_ANCHOR_ENTRY_ASSET_PATH
} from '../shell/home/runtime-loaders'
import { HOME_STATIC_ENTRY_ASSET_PATH } from '../shell/home/runtime-loaders'
import {
  HOME_BOOTSTRAP_ANCHOR_RUNTIME_ASSET_PATH
} from '../shell/home/runtime-loaders'
import { HOME_STATIC_ENTRY_DEMO_WARMUP_ASSET_PATH } from '../shell/home/runtime-loaders'
import {
  HOME_DEMO_ENTRY_ASSET_PATH,
  HOME_DEMO_STARTUP_ATTACH_RUNTIME_ASSET_PATH
} from '../shell/home/home-demo-runtime-types'
import {
  expandStaticShellDemoWarmHintPaths,
  expandStaticShellPostAnchorHintPaths,
  expandStaticShellPreloadPaths
} from '../shell/core/build-manifest.server'

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

const DEFERRED_MANIFEST_IDLE_TIMEOUT_MS = 30000
const DEFERRED_MANIFEST_FALLBACK_DELAY_MS = 24000
const STATIC_BOOTSTRAP_BUNDLE_PATHS = {
  'home-static': HOME_STATIC_ANCHOR_ENTRY_ASSET_PATH,
  'fragment-static': 'build/static-shell/apps/site/src/shell/fragments/fragment-static-entry.js',
  'island-static': 'build/static-shell/apps/site/src/shell/core/island-static-entry.js'
} as const
const STATIC_BOOTSTRAP_PRELOAD_PATHS = {
  'home-static': [
    STATIC_BOOTSTRAP_BUNDLE_PATHS['home-static'],
    HOME_BOOTSTRAP_ANCHOR_RUNTIME_ASSET_PATH
  ],
  'fragment-static': [
    STATIC_BOOTSTRAP_BUNDLE_PATHS['fragment-static'],
    'build/static-shell/apps/site/src/shell/fragments/fragment-bootstrap-runtime.js'
  ],
  'island-static': [
    STATIC_BOOTSTRAP_BUNDLE_PATHS['island-static'],
    'build/static-shell/apps/site/src/shell/core/island-bootstrap-runtime.js'
  ]
} as const
const STATIC_BOOTSTRAP_ROUTE_POST_ANCHOR_HINT_PATHS = {
  [HOME_STATIC_ROUTE_PATH]: [HOME_STATIC_ENTRY_ASSET_PATH]
} as const
const STATIC_BOOTSTRAP_ROUTE_DEMO_WARM_HINT_PATHS = {
  [HOME_STATIC_ROUTE_PATH]: [HOME_STATIC_ENTRY_DEMO_WARMUP_ASSET_PATH]
} as const
const STATIC_BOOTSTRAP_ROUTE_PRELOAD_PATHS = {
  [HOME_STATIC_ROUTE_PATH]: [
    HOME_DEMO_STARTUP_ATTACH_RUNTIME_ASSET_PATH,
    HOME_DEMO_ENTRY_ASSET_PATH
  ]
} as const
const STATIC_BOOTSTRAP_ROUTE_STYLE_HINTS = {
  [HOME_STATIC_ROUTE_PATH]: [homeStaticEagerStylesheetHref]
} as const

const buildDeferredManifestScript = (href: string) => {
  const escapedHref = JSON.stringify(href)
  return `(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  var started = false;
  var timeoutHandle = 0;
  var eventOptions = { capture: true, passive: true };
  var appendManifestFromIntent = function (event) {
    if (event && event.isTrusted === false) return;
    appendManifest();
  };
  var appendManifest = function () {
    if (started) return;
    started = true;
    window.removeEventListener('pointerdown', appendManifestFromIntent, eventOptions);
    window.removeEventListener('keydown', appendManifestFromIntent, eventOptions);
    window.removeEventListener('touchstart', appendManifestFromIntent, eventOptions);
    if (timeoutHandle) {
      window.clearTimeout(timeoutHandle);
      timeoutHandle = 0;
    }
    if (document.head.querySelector('link[rel="manifest"]')) return;
    var link = document.createElement('link');
    link.rel = 'manifest';
    link.href = ${escapedHref};
    document.head.appendChild(link);
  };
  var schedule = function () {
    window.addEventListener('pointerdown', appendManifestFromIntent, eventOptions);
    window.addEventListener('keydown', appendManifestFromIntent, eventOptions);
    window.addEventListener('touchstart', appendManifestFromIntent, eventOptions);
    timeoutHandle = window.setTimeout(appendManifest, ${DEFERRED_MANIFEST_FALLBACK_DELAY_MS});
  };
  if (document.readyState === 'complete') {
    schedule();
    return;
  }
  window.addEventListener('load', schedule, { once: true });
})();`
}

const buildConditionalHomeManifestScript = (href: string) => {
  const escapedHref = JSON.stringify(href)
  return `(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  var started = false;
  var timeoutHandle = 0;
  var eventOptions = { capture: true, passive: true };
  var appendManifestFromIntent = function (event) {
    if (event && event.isTrusted === false) return;
    appendManifest();
  };
  var appendManifest = function () {
    if (started) return;
    started = true;
    window.removeEventListener('pointerdown', appendManifestFromIntent, eventOptions);
    window.removeEventListener('keydown', appendManifestFromIntent, eventOptions);
    window.removeEventListener('touchstart', appendManifestFromIntent, eventOptions);
    if (timeoutHandle) {
      window.clearTimeout(timeoutHandle);
      timeoutHandle = 0;
    }
    if (document.head.querySelector('link[rel="manifest"]')) return;
    var link = document.createElement('link');
    link.rel = 'manifest';
    link.href = ${escapedHref};
    document.head.appendChild(link);
  };
  var scheduleDeferredAppend = function () {
    window.addEventListener('pointerdown', appendManifestFromIntent, eventOptions);
    window.addEventListener('keydown', appendManifestFromIntent, eventOptions);
    window.addEventListener('touchstart', appendManifestFromIntent, eventOptions);
    timeoutHandle = window.setTimeout(appendManifest, ${DEFERRED_MANIFEST_FALLBACK_DELAY_MS});
  };
  var isStandalonePwa = false;
  try {
    isStandalonePwa =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches;
  } catch (error) {}
  var nav = window.navigator;
  var isIosStandalone = !!nav && nav.standalone === true;
  if (isStandalonePwa || isIosStandalone) {
    appendManifest();
    return;
  }
  if (document.readyState === 'complete') {
    scheduleDeferredAppend();
    return;
  }
  window.addEventListener('load', scheduleDeferredAppend, { once: true });
})();`
}

type EarlyHint = {
  href: string
  as?: string
  rel?: 'preload' | 'modulepreload'
  type?: string
  crossorigin?: boolean | 'anonymous' | 'use-credentials'
}

const resolveLinkCrossOrigin = (
  crossorigin?: EarlyHint['crossorigin'] | string | null
) => {
  if (crossorigin === 'use-credentials') {
    return 'use-credentials'
  }

  if (crossorigin === 'anonymous' || crossorigin === '' || crossorigin === true) {
    return 'anonymous'
  }

  return undefined
}

const isPreloadableFragmentHint = (hint: EarlyHint) => {
  const href = hint.href?.trim()
  if (!href || hint.as !== 'fetch') return false
  return /^\/(?:api\/)?fragments\/bootstrap(?:[/?#]|$)/.test(href)
}

const shouldSkipEarlyHint = (hint: EarlyHint) => {
  const href = hint.href?.trim()
  if (!href) return true
  if (href.includes('webtransport')) return true
  if (href.includes('/fragments') && !isPreloadableFragmentHint(hint)) return true
  return false
}

const buildEarlyHintHeader = (hint: EarlyHint) => {
  if (shouldSkipEarlyHint(hint)) return null
  const crossoriginValue = resolveLinkCrossOrigin(hint.crossorigin) ?? null
  if (hint.rel === 'modulepreload') {
    let value = `<${hint.href}>; rel=modulepreload`
    if (crossoriginValue) value += `; crossorigin=${crossoriginValue}`
    return value
  }
  const asValue = hint.as?.trim()
  if (!asValue) return null
  let value = `<${hint.href}>; rel=preload; as=${asValue}`
  if (hint.type) value += `; type=${hint.type}`
  if (crossoriginValue) value += `; crossorigin=${crossoriginValue}`
  return value
}

const sanitizeHints = (raw: EarlyHint[]) => {
  const unique = new Map<string, EarlyHint>()
  raw.forEach((hint) => {
    if (!hint?.href) return
    if (!hint.as && hint.rel !== 'modulepreload') return
    if (shouldSkipEarlyHint(hint)) return
    const crossoriginKey =
      typeof hint.crossorigin === 'string' ? hint.crossorigin : hint.crossorigin ? '1' : '0'
    const key = `${hint.href}|${hint.as ?? ''}|${hint.rel ?? ''}|${hint.type ?? ''}|${crossoriginKey}`
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

const normalizeStaticPublicBase = (base: string) => {
  const normalized = base.endsWith('/') ? base : `${base}/`
  if (normalized === '/build/') return '/'
  if (normalized === './build/' || normalized === 'build/') return './'
  if (normalized.endsWith('/build/')) {
    return normalized.slice(0, -'build/'.length)
  }
  return normalized
}

const STATIC_PUBLIC_BASE = normalizeStaticPublicBase(import.meta.env.BASE_URL || '/')

const buildStaticBootstrapEarlyHints = (pathName: string, buildVersion: string | null): EarlyHint[] => {
  const normalizedPath = normalizeStaticShellRoutePath(pathName)
  const routeConfig = getStaticShellRouteConfig(normalizedPath)
  if (!routeConfig) {
    return []
  }

  const moduleHints = [
    ...expandStaticShellPreloadPaths(
      STATIC_BOOTSTRAP_PRELOAD_PATHS[routeConfig.bootstrapMode]
    ),
    ...expandStaticShellPostAnchorHintPaths(
      STATIC_BOOTSTRAP_ROUTE_POST_ANCHOR_HINT_PATHS[
        normalizedPath as keyof typeof STATIC_BOOTSTRAP_ROUTE_POST_ANCHOR_HINT_PATHS
      ] ?? []
    ),
    ...expandStaticShellDemoWarmHintPaths(
      STATIC_BOOTSTRAP_ROUTE_DEMO_WARM_HINT_PATHS[
        normalizedPath as keyof typeof STATIC_BOOTSTRAP_ROUTE_DEMO_WARM_HINT_PATHS
      ] ?? []
    ),
    ...(STATIC_BOOTSTRAP_ROUTE_PRELOAD_PATHS[
      normalizedPath as keyof typeof STATIC_BOOTSTRAP_ROUTE_PRELOAD_PATHS
    ] ?? [])
  ].map((path) => ({
    href: buildVersion
      ? appendStaticAssetVersion(`${STATIC_PUBLIC_BASE}${path}`, buildVersion)
      : `${STATIC_PUBLIC_BASE}${path}`,
    rel: 'modulepreload' as const,
    crossorigin: 'anonymous' as const
  }))
  const styleHints = (
    STATIC_BOOTSTRAP_ROUTE_STYLE_HINTS[
      normalizedPath as keyof typeof STATIC_BOOTSTRAP_ROUTE_STYLE_HINTS
    ] ?? []
  ).map((href) => ({
    href,
    as: 'style' as const
  }))

  return [...moduleHints, ...styleHints]
}

const withLangParam = (href: string, langValue: Lang) => {
  if (!href || !href.startsWith('/')) return href
  const base = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
  try {
    const url = new URL(toCanonicalStaticShellHref(href), base)
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

const shouldPreferSameOriginDbProxy = (href: string | undefined, currentOrigin: string | null) => {
  if (!href || !currentOrigin) return false
  try {
    const candidateUrl = new URL(href)
    const originUrl = new URL(currentOrigin)
    if (candidateUrl.origin === originUrl.origin) return false
    return candidateUrl.hostname === `db.${originUrl.hostname}`
  } catch {
    return false
  }
}

const resolvePreconnectSpacetimeDbUri = (currentOrigin: string | null, fallbackHref: string | undefined) => {
  if (!currentOrigin) return fallbackHref
  try {
    const url = new URL(currentOrigin)
    const hostname = url.hostname
    const isIpAddress = /^[\d.:]+$/.test(hostname)
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
    if (!isIpAddress && !isLocalHost) {
      if (!hostname.startsWith('db.')) {
        url.hostname = `db.${hostname}`
      }
      url.pathname = '/'
      url.search = ''
      url.hash = ''
      return url.toString()
    }
  } catch {
    // Fall back to the configured runtime URL below.
  }
  return fallbackHref
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

const buildPreconnectOrigins = ({
  currentOrigin,
  includeTracking,
  pathname,
  isAuthenticated
}: {
  currentOrigin: string | null
  includeTracking: boolean
  pathname: string
  isAuthenticated: boolean
}) => {
  const origins = new Set<string>()
  const staticRouteConfig = getStaticShellRouteConfig(pathname)
  const isHomeRoute = isHomeStaticPath(pathname)
  const spacetimeDbUri = resolvePreconnectSpacetimeDbUri(currentOrigin, appConfig.spacetimeDbUri)
  const shouldPreconnectDb =
    !isHomeRoute &&
    (staticRouteConfig
      ? staticRouteConfig.routeKind === FRAGMENT_STATIC_ROUTE_KIND ||
        staticRouteConfig.authPolicy === 'protected'
      : true)
  const shouldPreconnectDbOrigin =
    shouldPreconnectDb && !shouldPreferSameOriginDbProxy(spacetimeDbUri, currentOrigin)
  const shouldPreconnectAuth =
    isAuthenticated || pathname === '/login' || staticRouteConfig?.authPolicy === 'protected'
  const shouldPreconnectWebTransport =
    shouldPreconnectDb &&
    appConfig.enableFragmentStreaming &&
    (appConfig.preferWebTransport || appConfig.preferWebTransportDatagrams)

  const addOrigin = (href: string | undefined) => {
    const origin = toPreconnectOrigin(href, currentOrigin)
    if (!origin) return
    if (origin === currentOrigin) return
    origins.add(origin)
  }

  addOrigin(appConfig.apiBase)
  if (shouldPreconnectDbOrigin) {
    addOrigin(spacetimeDbUri)
  }
  if (shouldPreconnectAuth) {
    addOrigin(appConfig.spacetimeAuthAuthority)
  }
  if (shouldPreconnectWebTransport) {
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

type ShellTheme = 'light' | 'dark'

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

const TranslateIcon = () => (
  <svg
    class="lang-toggle-icon"
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
    <path d="M4 5h12M10 5a17.3 17.3 0 0 1-4 10M6 15c1.8-1 3.6-2.7 5-5M14 19l4-9 4 9M15.5 16h5" />
  </svg>
)

type ShellSettingsPanelProps = {
  open: boolean
  rootRef: Signal<HTMLDivElement | undefined>
  triggerRef: Signal<HTMLButtonElement | undefined>
  copy: Record<string, string>
  hasMultipleLangs: boolean
  langSignal: Signal<Lang>
  langMenuOpen: Signal<boolean>
  themeSignal: Signal<ShellTheme>
  onApplyLangChoice$: QRL<(next: Lang) => void>
  onToggleThemeChoice$: QRL<() => void>
  onToggleLanguageMenu$: QRL<() => void>
  onClose$: QRL<() => void>
}

const ShellSettingsPanel = component$<ShellSettingsPanelProps>((props) => {
  const {
    open,
    rootRef,
    triggerRef,
    copy,
    hasMultipleLangs,
    langSignal,
    langMenuOpen,
    themeSignal,
    onApplyLangChoice$,
    onToggleThemeChoice$,
    onToggleLanguageMenu$,
    onClose$
  } = props
  const panelRef = useSignal<HTMLDivElement>()
  const languageTriggerRef = useSignal<HTMLButtonElement>()
  const langDrawerRef = useSignal<HTMLDivElement>()
  const wasOpen = useSignal(false)
  const wasLangOpen = useSignal(false)

  useVisibleTask$((ctx) => {
    const isOpen = ctx.track(() => open)
    const isLangMenuOpen = ctx.track(() => langMenuOpen.value)
    const panel = panelRef.value
    const langDrawer = langDrawerRef.value
    const langDrawerOpen = isOpen && hasMultipleLangs && isLangMenuOpen

    if (isOpen && !wasOpen.value) {
      setOverlaySurfaceState(panel, true)
      focusOverlayEntry(panel, hasMultipleLangs ? '.settings-lang-trigger' : '.theme-toggle')
    } else if (!isOpen && wasOpen.value) {
      restoreOverlayFocusBeforeHide(panel, triggerRef.value)
      setOverlaySurfaceState(panel, false)
    } else {
      setOverlaySurfaceState(panel, isOpen)
    }

    if (langDrawerOpen && !wasLangOpen.value) {
      setOverlaySurfaceState(langDrawer, true)
      focusOverlayEntry(langDrawer, [
        'input[name="topbar-language"]:checked',
        'input[name="topbar-language"]'
      ])
    } else if (isOpen && !langDrawerOpen && wasLangOpen.value) {
      restoreOverlayFocusBeforeHide(langDrawer, languageTriggerRef.value)
      setOverlaySurfaceState(langDrawer, false)
    } else {
      setOverlaySurfaceState(langDrawer, langDrawerOpen)
    }

    wasOpen.value = isOpen
    wasLangOpen.value = langDrawerOpen
  })

  useVisibleTask$(
    (ctx) => {
      const isOpen = ctx.track(() => open)
      if (!isOpen) return

      const cleanup = bindOverlayDismiss({
        root: rootRef.value,
        onDismiss: () => {
          onClose$()
        }
      })

      ctx.cleanup(cleanup)
    },
    { strategy: 'document-ready' }
  )

  return (
    <div
      ref={panelRef}
      class="settings-dropdown"
      id="topbar-settings-menu"
      role="dialog"
      aria-modal="false"
      aria-labelledby="topbar-settings-heading"
      data-open={open ? 'true' : 'false'}
      hidden={!open}
      aria-hidden={open ? 'false' : 'true'}
    >
      <h2 class="sr-only" id="topbar-settings-heading">
        {copy.navSettings}
      </h2>
      <div class="settings-controls">
        {hasMultipleLangs ? (
          <button
            ref={languageTriggerRef}
            type="button"
            class="lang-toggle settings-lang-trigger"
            data-lang={langSignal.value}
            aria-expanded={open && langMenuOpen.value ? 'true' : 'false'}
            aria-label={copy.languageToggleLabel}
            aria-controls="topbar-settings-language-panel"
            onClick$={onToggleLanguageMenu$}
          >
            <TranslateIcon />
          </button>
        ) : null}
        <button
          class="theme-toggle"
          type="button"
          data-theme={themeSignal.value}
          aria-pressed={themeSignal.value === 'dark'}
          aria-label={themeSignal.value === 'dark' ? copy.themeAriaToLight : copy.themeAriaToDark}
          onClick$={onToggleThemeChoice$}
        >
          {themeSignal.value === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
      {hasMultipleLangs ? (
        <div
          ref={langDrawerRef}
          class="settings-lang-drawer"
          id="topbar-settings-language-panel"
          data-open={open && langMenuOpen.value ? 'true' : 'false'}
          hidden={!open || !langMenuOpen.value}
          aria-hidden={open && langMenuOpen.value ? 'false' : 'true'}
          aria-labelledby="topbar-settings-heading"
        >
          <fieldset class="settings-lang-list">
            <legend class="sr-only">{copy.languageToggleLabel}</legend>
            {supportedLangs.map((langOption) => {
              const langValue = langOption as Lang
              const isActive = langSignal.value === langValue
              return (
                <label
                  key={langOption}
                  class="settings-lang-option"
                  data-active={isActive ? 'true' : 'false'}
                >
                  <input
                    class="settings-lang-input"
                    type="radio"
                    name="topbar-language"
                    checked={isActive}
                    onChange$={$(() => {
                      onApplyLangChoice$(langValue)
                      langMenuOpen.value = false
                    })}
                  />
                  <span class="settings-lang-code">{getLangLabel(langOption)}</span>
                </label>
              )
            })}
          </fieldset>
        </div>
      ) : null}
    </div>
  )
})

export const useAuthSession = routeLoader$<AuthSessionState>(async ({ request }) => loadAuthSession(request))

export const useShellPreferences = routeLoader$(async (event) => {
  const { createServerLanguageSeed } = await import('../lang/server')
  const lang = resolveRequestLang(event.request)
  const theme = readThemeFromCookie(event.request.headers.get('cookie')) ?? defaultTheme
  return {
    lang,
    theme,
    languageSeed: createServerLanguageSeed(lang, shellLanguageSelection)
  }
})

export const useStaticShellBuildVersion = routeLoader$(async () => {
  const { getStaticShellBuildVersion } = await import('../shell/core/build-version.server')
  return getStaticShellBuildVersion()
})

export const useInitialFadeState = routeLoader$((_event) => {
  const initialFade = null
  const criticalLite = 'ready'
  return { initialFade, criticalLite }
})

export const onRequest: RequestHandler = async (event) => {
  const { headers, method, request } = event
  const requestUrl = new URL(request.url)
  const isCacheableMethod = method === 'GET' || method === 'HEAD'
  const isHtmlRequest = isCacheableMethod && request.headers.get('accept')?.toLowerCase().includes('text/html')

  if (isHtmlRequest) {
    headers.set('Cache-Control', PUBLIC_CACHE_CONTROL)
  } else if (isCacheableMethod && !headers.has('Cache-Control')) {
    headers.set('Cache-Control', PUBLIC_CACHE_CONTROL)
  }

  if (isHtmlRequest) {
    const nonce = getOrCreateRequestCspNonce(event)
    const { getStaticShellBuildVersion } = await import('../shell/core/build-version.server')
    const staticShellBuildVersion = getStaticShellBuildVersion()
    const planHints = sanitizeHints([
      ...getPlanEarlyHints(requestUrl.pathname, request),
      ...buildStaticBootstrapEarlyHints(requestUrl.pathname, staticShellBuildVersion)
    ])
    headers.set(
      'Content-Security-Policy',
      buildSiteCsp({
        nonce,
        currentOrigin: requestUrl.origin,
        pathname: requestUrl.pathname
      })
    )
    headers.set('Cross-Origin-Opener-Policy', 'same-origin')
    headers.set('X-Frame-Options', 'DENY')
    planHints.map(buildEarlyHintHeader).filter((value): value is string => Boolean(value)).forEach((link) => {
      headers.append('Link', link)
    })
  }

  await event.next()
}

export const RouterHead = component$(() => {
  const head = useDocumentHead()
  const location = useLocation()
  const authSession = useAuthSession()
  const nonce = useCspNonce()
  const initialFade = (head.htmlAttributes as Record<string, string> | undefined)?.['data-initial-fade']
  const isHomeStaticRoute = isHomeStaticPath(location.url.pathname)
  const shouldUseConditionalHomeManifest = isHomeStaticRoute
  const shouldDeferManifest =
    isStaticShellPath(location.url.pathname) && !isHomeStaticRoute
  const currentOrigin = location.url?.origin ?? null
  const trackingOrigins = buildTrackingOrigins(currentOrigin)
  const preconnectOrigins = buildPreconnectOrigins({
    currentOrigin,
    includeTracking: false,
    pathname: location.url.pathname,
    isAuthenticated: authSession.value.status === 'authenticated'
  })
  const base = import.meta.env.BASE_URL || '/'
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  const withBase = (path: string) => `${normalizedBase}${path.replace(/^\/+/, '')}`
  const manifestHref = withBase('manifest.webmanifest')
  const pwaEnabled = appConfig.template.features.pwa
  const partytownScript = buildPartytownHeadScript({
    config: appConfig.partytown,
    lib: withBase('~partytown/'),
    nonce: nonce || undefined
  })

  return (
    <>
      <title>{head.title}</title>
      {head.meta.map((meta) => (
        <meta key={`${meta.name || meta.property}-${meta.content}`} {...meta} />
      ))}
      {partytownScript ? <script nonce={nonce || undefined} dangerouslySetInnerHTML={partytownScript} /> : null}
      {head.links.flatMap((link) => {
        if (link.rel === 'stylesheet' && typeof link.href === 'string') {
          const fragmentId = (link as Record<string, string>)['data-fragment-css']
          return [
            <link
              key={`preload-style-${link.href}`}
              rel="preload"
              as="style"
              href={link.href}
              crossOrigin={resolveLinkCrossOrigin(link.crossorigin)}
              {...(fragmentId ? { 'data-fragment-css': fragmentId } : {})}
            />,
            <link key={`${link.rel}-${link.href}`} {...link} />
          ]
        }

        return <link key={`${link.rel}-${link.href}`} crossOrigin={resolveLinkCrossOrigin(link.crossorigin)} {...link} />
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
          <style nonce={nonce || undefined}>{initialFadeStyle}</style>
          <script nonce={nonce || undefined} dangerouslySetInnerHTML={initialFadeScript} />
        </>
      ) : null}
      <link rel="icon" href={withBase('favicon.svg')} type="image/svg+xml" />
      <link rel="icon" href={withBase('favicon.ico')} sizes="any" />
      {pwaEnabled ? (
        shouldUseConditionalHomeManifest ? (
          <script
            nonce={nonce || undefined}
            dangerouslySetInnerHTML={buildConditionalHomeManifestScript(manifestHref)}
          />
        ) : shouldDeferManifest ? (
          <script
            nonce={nonce || undefined}
            dangerouslySetInnerHTML={buildDeferredManifestScript(manifestHref)}
          />
        ) : (
          <link rel="manifest" href={manifestHref} />
        )
      ) : null}
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <meta name="theme-color" content={siteBrand.themeColor} />
      <meta name="theme-color" media="(prefers-color-scheme: dark)" content={siteBrand.themeColor} />
      {pwaEnabled ? <meta name="apple-mobile-web-app-capable" content="yes" /> : null}
      {pwaEnabled ? <meta name="mobile-web-app-capable" content="yes" /> : null}
      {pwaEnabled ? <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" /> : null}
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

const InteractiveShellLayout = component$(() => {
  const location = useLocation()
  const shellPreferences = useShellPreferences()
  useLanguageSeed(shellPreferences.value.lang, shellPreferences.value.languageSeed)
  const langSignal = useProvideLangSignal(shellPreferences.value.lang)
  const copy = useLangCopy(langSignal)
  const fragmentStatus = useSharedFragmentStatusSignal()
  const authSession = useAuthSession()
  const isAuthenticated = authSession.value.status === 'authenticated'
  const settingsOpen = useSignal(false)
  const settingsPanelMounted = useSignal(false)
  const settingsRef = useSignal<HTMLDivElement>()
  const settingsTriggerRef = useSignal<HTMLButtonElement>()
  const langMenuOpen = useSignal(false)
  const themeSignal = useSignal<ShellTheme>(shellPreferences.value.theme === 'dark' ? 'dark' : 'light')
  const currentLanguageSelection = mergeLanguageSelections(
    shellLanguageSelection,
    resolveRouteLanguageSelection(location.url.pathname)
  )
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
  useVisibleTask$(
    (ctx) => {
      if (typeof window === 'undefined') return
      const pathName = ctx.track(() => location.url.pathname)
      const currentLang = ctx.track(() => langSignal.value)
      const selection = mergeLanguageSelections(shellLanguageSelection, resolveRouteLanguageSelection(pathName))
      const otherLangs = supportedLangs.filter((value) => value !== currentLang)
      if (!otherLangs.length) return

      let cancelled = false
      const prefetchAll = () => {
        if (cancelled) return
        otherLangs.forEach((value) => {
          void prefetchLanguageResources(value, selection)
        })
      }

      let timeoutHandle = 0
      let idleHandle = 0
      if (typeof window.requestIdleCallback === 'function') {
        idleHandle = window.requestIdleCallback(prefetchAll, { timeout: 1600 })
      } else {
        timeoutHandle = window.setTimeout(prefetchAll, 220)
      }

      ctx.cleanup(() => {
        cancelled = true
        if (idleHandle) window.cancelIdleCallback(idleHandle)
        if (timeoutHandle) window.clearTimeout(timeoutHandle)
      })
    },
    { strategy: 'document-idle' }
  )

  useVisibleTask$(
    (ctx) => {
      if (typeof window === 'undefined') return
      const initialSession = ctx.track(() => authSession.value)
      let revalidating = false

      const handlePageShow = (event: PageTransitionEvent) => {
        if (!event.persisted || revalidating) return
        revalidating = true
        void revalidateClientAuthSession()
          .then((restoredSession) => {
            if (!restoredSession) return
            if (didAuthSessionChange(initialSession, restoredSession)) {
              window.location.reload()
            }
          })
          .catch((error) => {
            console.warn('Failed to revalidate auth session after bfcache restore:', error)
          })
          .finally(() => {
            revalidating = false
          })
      }

      window.addEventListener('pageshow', handlePageShow)
      ctx.cleanup(() => {
        window.removeEventListener('pageshow', handlePageShow)
      })
    },
    { strategy: 'document-ready' }
  )

  const applyLangChoice = $(async (next: Lang) => {
    if (langSignal.value === next) return
    try {
      await loadLanguageResources(next, currentLanguageSelection)
    } catch (error) {
      console.warn('Failed to load target language resources:', next, error)
      return
    }
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
      async () => {
        langSignal.value = next
        applyLang(next)
        await setPreference('locale', next)
      },
      {
        mutationRoot: root,
        timeoutMs: 420,
        variant: 'ui'
      }
    )
  })
  const toggleThemeChoice = $(() => {
    void withUserActionHapticsDeferred(async () => {
      await triggerHapticTapDeferred()
      const currentTheme =
        typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
      const nextTheme: ShellTheme = currentTheme === 'dark' ? 'light' : 'dark'
      themeSignal.value = nextTheme
      const { applyTheme } = await import('@prometheus/ui')
      applyTheme(nextTheme)
      await setPreference('theme', nextTheme)
    })
  })
  const toggleLanguageMenu = $(() => {
    void withUserActionHapticsDeferred(async () => {
      await triggerHapticSelectionDeferred()
      const selectedIndex = await showNativeActionSheetDeferred(
        copy.value.languageToggleLabel,
        supportedLangs.map((item) => ({ title: getLangLabel(item) }))
      )
      if (selectedIndex !== null && selectedIndex >= 0 && selectedIndex < supportedLangs.length) {
        const selected = supportedLangs[selectedIndex] as Lang
        void applyLangChoice(selected)
        return
      }
      langMenuOpen.value = !langMenuOpen.value
    })
  })
  const closeSettingsPanel = $(() => {
    settingsOpen.value = false
    langMenuOpen.value = false
  })

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
              <div
                class="fragment-status"
                data-state={fragmentStatus.value}
                role="status"
                aria-live="polite"
                aria-label={statusLabel}
              >
                <span class="dot" aria-hidden="true" />
              </div>
              <button
                ref={settingsTriggerRef}
                class="settings-trigger"
                type="button"
                aria-haspopup="dialog"
                aria-expanded={settingsOpen.value ? 'true' : 'false'}
                aria-label={copy.value.navSettings}
                aria-controls="topbar-settings-menu"
                onClick$={$(() => withUserActionHapticsDeferred(async () => {
                  await triggerHapticTapDeferred()
                  const next = !settingsOpen.value
                  if (next) {
                    settingsPanelMounted.value = true
                  }
                  settingsOpen.value = next
                  if (!next) {
                    langMenuOpen.value = false
                  }
                }))}
              >
                <InSettings class="settings-trigger-icon" aria-hidden="true" />
              </button>
              {settingsPanelMounted.value ? (
                <ShellSettingsPanel
                  open={settingsOpen.value}
                  rootRef={settingsRef}
                  triggerRef={settingsTriggerRef}
                  copy={copy.value}
                  hasMultipleLangs={hasMultipleLangs}
                  langSignal={langSignal}
                  langMenuOpen={langMenuOpen}
                  themeSignal={themeSignal}
                  onApplyLangChoice$={applyLangChoice}
                  onToggleThemeChoice$={toggleThemeChoice}
                  onToggleLanguageMenu$={toggleLanguageMenu}
                  onClose$={closeSettingsPanel}
                />
              ) : null}
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
          const isActive =
            href === '/'
              ? location.url.pathname === '/'
              : location.url.pathname === href || location.url.pathname.startsWith(`${href}/`)
          return (
            <DockIcon key={href} label={label}>
              <Link
                class="dock-link"
                href={langHref}
                prefetch={false}
                data-fragment-link
                aria-label={label}
                aria-current={isActive ? 'page' : undefined}
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

export default component$(() => {
  const location = useLocation()
  const shellPreferences = useShellPreferences()
  const authSession = useAuthSession()
  const staticShellBuildVersion = useStaticShellBuildVersion()
  const staticRouteConfig = getStaticShellRouteConfig(location.url.pathname)

  if (isStaticShellPath(location.url.pathname)) {
    return (
      <StaticShellLayout
        currentPath={location.url.pathname}
        isAuthenticated={authSession.value.status === 'authenticated'}
        lang={shellPreferences.value.lang}
        theme={shellPreferences.value.theme}
        languageSeed={shellPreferences.value.languageSeed}
        buildVersion={staticShellBuildVersion.value}
        routeKind={
          staticRouteConfig?.routeKind ??
          (isHomeStaticPath(location.url.pathname) ? HOME_STATIC_ROUTE_KIND : FRAGMENT_STATIC_ROUTE_KIND)
        }
      >
        <Slot />
      </StaticShellLayout>
    )
  }

  return (
    <InteractiveShellLayout>
      <Slot />
    </InteractiveShellLayout>
  )
})
