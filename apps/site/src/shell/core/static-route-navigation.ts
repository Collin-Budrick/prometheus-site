import { loadFragmentBootstrapRuntime } from '../fragments/runtime-loaders'
import { loadHomeBootstrapRuntime } from '../home/runtime-loaders'
import { enabledAuthNavItems, enabledNavItems } from '../../site-config'
import { resolveStaticShellLangParam } from './lang-param'
import { loadIslandBootstrapRuntime } from './runtime-loaders'
import {
  getStaticShellRouteConfig,
  STATIC_ROUTE_ATTR,
  STATIC_SHELL_REGION_ATTR,
  toCanonicalStaticShellHref
} from './constants'
import {
  applyStaticShellSnapshot,
  captureCurrentStaticShellSnapshot,
  loadStaticShellSnapshot
} from './snapshot-client'
import {
  readStaticShellSeed,
  syncStaticShellSeedFromDocument
} from './seed-client'
import {
  createDockRouteDescriptors,
  resolveRouteMotionDirection
} from '../../shared/route-navigation'
import { runRouteViewTransition } from '../../shared/view-transitions'

type StaticRouteNavigationWindow = Window & typeof globalThis & {
  __PROM_STATIC_ROUTE_NAVIGATION__?: boolean
}

type StaticRouteNavigationOptions = {
  win?: StaticRouteNavigationWindow | null
  doc?: Document | null
  captureSnapshot?: typeof captureCurrentStaticShellSnapshot
  loadSnapshot?: typeof loadStaticShellSnapshot
  applySnapshot?: typeof applyStaticShellSnapshot
  readSeed?: typeof readStaticShellSeed
  syncSeed?: typeof syncStaticShellSeedFromDocument
  ensureHomeEntry?: () => Promise<void>
  ensureHomeStaticEntry?: () => Promise<void>
  ensureFragmentEntry?: () => Promise<void>
  ensureIslandEntry?: () => Promise<void>
  bootstrapHome?: () => Promise<void>
  bootstrapFragment?: () => Promise<void>
  bootstrapIsland?: () => Promise<void>
  disposeHome?: () => Promise<void>
  disposeFragment?: () => Promise<void>
  disposeIsland?: () => Promise<void>
  routeTransition?: typeof runRouteViewTransition
}

type ClickLikeEvent = MouseEvent & {
  target: EventTarget | null
}

const STATIC_ROUTE_LINK_SELECTOR = 'a[href]'
const PUBLIC_DOCK_DESCRIPTORS = createDockRouteDescriptors(enabledNavItems)
const AUTH_DOCK_DESCRIPTORS = createDockRouteDescriptors(enabledAuthNavItems)

const isElementLike = (value: unknown): value is Element =>
  Boolean(
    value &&
      typeof value === 'object' &&
      (value as { nodeType?: unknown }).nodeType === 1 &&
      typeof (value as { closest?: unknown }).closest === 'function'
  )

const resolveAnchorTarget = (target: EventTarget | null) => {
  if (!isElementLike(target)) {
    return null
  }
  return target.closest<HTMLAnchorElement>(STATIC_ROUTE_LINK_SELECTOR)
}

const readComparableHref = (url: URL) =>
  toCanonicalStaticShellHref(`${url.pathname}${url.search}${url.hash}`)

const toHistoryHref = (url: URL) => `${url.pathname}${url.search}${url.hash}`

const importHomeStaticAnchorEntry = async () => {
  await import('../home/home-static-anchor-entry')
}

const importHomeStaticEntry = async () => {
  const module = await import('../home/home-static-entry')
  await module.waitForHomeStaticEntryInstallation?.()
}

const importFragmentStaticEntry = async () => {
  await import('../fragments/fragment-static-entry')
}

const importIslandStaticEntry = async () => {
  await import('./island-static-entry')
}

const destroyActiveHomeRoute = async () => {
  const [{ destroyHomeController }, { getActiveHomeController }] = await Promise.all([
    import('../home/home-controller-runtime'),
    import('../home/home-active-controller')
  ])
  await destroyHomeController(getActiveHomeController())
}

const destroyActiveFragmentRoute = async () => {
  const runtime = await loadFragmentBootstrapRuntime()
  await runtime.disposeStaticFragmentShell?.()
}

const destroyActiveIslandRoute = async () => {
  const runtime = await loadIslandBootstrapRuntime()
  await runtime.disposeStaticIslandShell?.()
}

const bootstrapStaticHomeRoute = async () => {
  await importHomeStaticAnchorEntry()
  const runtime = await loadHomeBootstrapRuntime()
  await runtime.bootstrapStaticHome()
}

const bootstrapStaticFragmentRoute = async () => {
  await importFragmentStaticEntry()
  const runtime = await loadFragmentBootstrapRuntime()
  await runtime.bootstrapStaticFragmentShell()
}

const bootstrapStaticIslandRoute = async () => {
  await importIslandStaticEntry()
  const runtime = await loadIslandBootstrapRuntime()
  await runtime.bootstrapStaticIslandShell()
}

const scrollToTop = (win: Window) => {
  if (typeof win.scrollTo !== 'function') {
    return
  }
  try {
    win.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  } catch {
    win.scrollTo(0, 0)
  }
}

const resolveRouteDescriptors = (isAuthenticated: boolean) =>
  isAuthenticated ? AUTH_DOCK_DESCRIPTORS : PUBLIC_DOCK_DESCRIPTORS

const resolveTransitionDirection = ({
  currentPath,
  targetPath,
  isAuthenticated
}: {
  currentPath: string
  targetPath: string
  isAuthenticated: boolean
}) => {
  const direction = resolveRouteMotionDirection(
    currentPath,
    targetPath,
    resolveRouteDescriptors(isAuthenticated)
  )
  return direction === 'none' ? 'neutral' : direction
}

const resolveTransitionRoots = (doc: Document) =>
  ['header', 'main', 'dock']
    .map((region) => doc.querySelector(`[${STATIC_SHELL_REGION_ATTR}="${region}"]`))
    .filter((root): root is Element => Boolean(root))

export const installStaticRouteNavigation = ({
  win = typeof window !== 'undefined' ? (window as StaticRouteNavigationWindow) : null,
  doc = typeof document !== 'undefined' ? document : null,
  captureSnapshot = captureCurrentStaticShellSnapshot,
  loadSnapshot = loadStaticShellSnapshot,
  applySnapshot = applyStaticShellSnapshot,
  readSeed = readStaticShellSeed,
  syncSeed = syncStaticShellSeedFromDocument,
  ensureHomeEntry = importHomeStaticAnchorEntry,
  ensureHomeStaticEntry = importHomeStaticEntry,
  ensureFragmentEntry = importFragmentStaticEntry,
  ensureIslandEntry = importIslandStaticEntry,
  bootstrapHome = bootstrapStaticHomeRoute,
  bootstrapFragment = bootstrapStaticFragmentRoute,
  bootstrapIsland = bootstrapStaticIslandRoute,
  disposeHome = destroyActiveHomeRoute,
  disposeFragment = destroyActiveFragmentRoute,
  disposeIsland = destroyActiveIslandRoute,
  routeTransition = runRouteViewTransition
}: StaticRouteNavigationOptions = {}) => {
  if (!win || !doc || win.__PROM_STATIC_ROUTE_NAVIGATION__) {
    return () => undefined
  }

  win.__PROM_STATIC_ROUTE_NAVIGATION__ = true
  let navigationChain = Promise.resolve()

  const isStaticRouteDocument = () =>
    Boolean(doc.querySelector?.(`[${STATIC_ROUTE_ATTR}]`))

  const disposeCurrentRoute = async () => {
    const currentSeed = readSeed(doc)
    const currentConfig = getStaticShellRouteConfig(
      currentSeed?.currentPath || win.location.pathname
    )
    switch (currentConfig?.bootstrapMode) {
      case 'home-static':
        await disposeHome()
        return
      case 'fragment-static':
        await disposeFragment()
        return
      case 'island-static':
        await disposeIsland()
        return
      default:
        return
    }
  }

  const bootstrapTargetRoute = async (pathname: string) => {
    const targetConfig = getStaticShellRouteConfig(pathname)
    switch (targetConfig?.bootstrapMode) {
      case 'home-static':
        await ensureHomeEntry()
        await ensureHomeStaticEntry()
        await bootstrapHome()
        return
      case 'fragment-static':
        await ensureFragmentEntry()
        await bootstrapFragment()
        return
      case 'island-static':
        await ensureIslandEntry()
        await bootstrapIsland()
        return
      default:
        return
    }
  }

  const navigateToRoute = (targetUrl: URL, historyMode: 'push' | 'replace' | 'pop') => {
    navigationChain = navigationChain
      .catch(() => undefined)
      .then(async () => {
        if (!isStaticRouteDocument()) {
          return
        }

        const currentComparableHref = readComparableHref(new URL(win.location.href))
        const targetComparableHref = readComparableHref(targetUrl)
        if (currentComparableHref === targetComparableHref) {
          return
        }

        const currentSeed = readSeed(doc)
        if (!currentSeed) {
          win.location.href = targetUrl.toString()
          return
        }

        const targetConfig = getStaticShellRouteConfig(targetUrl.pathname)
        if (!targetConfig) {
          win.location.href = targetUrl.toString()
          return
        }

        const targetLang =
          resolveStaticShellLangParam(targetUrl.searchParams.get('lang')) ??
          currentSeed.lang
        const snapshot = await loadSnapshot(targetConfig.snapshotKey, targetLang)
        const transitionDirection = resolveTransitionDirection({
          currentPath: currentSeed.currentPath || win.location.pathname,
          targetPath: targetConfig.path,
          isAuthenticated: currentSeed.isAuthenticated ?? false
        })

        await routeTransition(
          async () => {
            captureSnapshot(currentSeed.snapshotKey, currentSeed.lang, doc)
            await disposeCurrentRoute()

            if (historyMode === 'push') {
              win.history.pushState(win.history.state, '', toHistoryHref(targetUrl))
            } else if (historyMode === 'replace') {
              win.history.replaceState(win.history.state, '', toHistoryHref(targetUrl))
            }

            applySnapshot(snapshot, {
              dockState: {
                lang: targetLang,
                currentPath: targetConfig.path,
                isAuthenticated: currentSeed.isAuthenticated ?? false
              }
            })
            syncSeed(doc)
            if (historyMode !== 'pop') {
              scrollToTop(win)
            }
            await bootstrapTargetRoute(targetUrl.pathname)
          },
          {
            direction: transitionDirection,
            mutationRoots: resolveTransitionRoots(doc)
          }
        )
      })
      .catch((error) => {
        console.error('Static route navigation failed:', error)
        win.location.href = targetUrl.toString()
      })

    return navigationChain
  }

  const handleClick = (event: Event) => {
    const nextEvent = event as ClickLikeEvent
    if (
      nextEvent.defaultPrevented ||
      nextEvent.button !== 0 ||
      nextEvent.metaKey ||
      nextEvent.ctrlKey ||
      nextEvent.shiftKey ||
      nextEvent.altKey ||
      !isStaticRouteDocument()
    ) {
      return
    }

    const anchor = resolveAnchorTarget(nextEvent.target)
    if (!anchor || anchor.hasAttribute('download')) {
      return
    }
    if (anchor.target && anchor.target !== '_self') {
      return
    }

    let targetUrl: URL
    try {
      targetUrl = new URL(anchor.href, win.location.origin)
    } catch {
      return
    }

    if (targetUrl.origin !== win.location.origin) {
      return
    }
    if (!getStaticShellRouteConfig(targetUrl.pathname)) {
      return
    }

    event.preventDefault()
    void navigateToRoute(targetUrl, 'push')
  }

  const handlePopState = () => {
    if (!isStaticRouteDocument()) {
      return
    }
    if (!getStaticShellRouteConfig(win.location.pathname)) {
      return
    }
    void navigateToRoute(new URL(win.location.href), 'pop')
  }

  doc.addEventListener('click', handleClick, true)
  win.addEventListener('popstate', handlePopState)

  return () => {
    doc.removeEventListener('click', handleClick, true)
    win.removeEventListener('popstate', handlePopState)
    win.__PROM_STATIC_ROUTE_NAVIGATION__ = false
  }
}

if (typeof window !== 'undefined') {
  const cleanup = installStaticRouteNavigation()
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      cleanup()
    })
  }
}
