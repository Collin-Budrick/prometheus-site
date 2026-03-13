export const HOME_STATIC_ROUTE_PATH = '/'
export const HOME_STATIC_ROUTE_KIND = 'home'
export const FRAGMENT_STATIC_ROUTE_KIND = 'fragment'
export const ISLAND_STATIC_ROUTE_KIND = 'island'

export type StaticShellBootstrapMode = 'home-static' | 'fragment-static' | 'island-static'
export type StaticShellAuthPolicy = 'public' | 'protected' | 'guest'

export type StaticShellRouteConfig = {
  path: string
  routeKind: typeof HOME_STATIC_ROUTE_KIND | typeof FRAGMENT_STATIC_ROUTE_KIND | typeof ISLAND_STATIC_ROUTE_KIND
  bootstrapMode: StaticShellBootstrapMode
  authPolicy: StaticShellAuthPolicy
  snapshotKey: string
}

export const STATIC_ROUTE_ATTR = 'data-static-route'
export const STATIC_SHELL_REGION_ATTR = 'data-static-shell-region'
export const STATIC_DOCK_ROOT_ATTR = 'data-static-dock-root'
export const STATIC_FRAGMENT_CARD_ATTR = 'data-static-fragment-card'
export const STATIC_FRAGMENT_BODY_ATTR = 'data-static-fragment-body'
export const STATIC_FRAGMENT_VERSION_ATTR = 'data-fragment-version'
export const STATIC_FRAGMENT_LOCKED_ATTR = 'data-static-fragment-locked'
export const STATIC_HOME_FRAGMENT_KIND_ATTR = 'data-static-home-fragment-kind'
export const STATIC_HOME_LCP_STABLE_ATTR = 'data-static-home-lcp-stable'
export type StaticHomeCardStage = 'critical' | 'anchor' | 'deferred'
export const STATIC_HOME_STAGE_ATTR = 'data-static-home-stage'
export const STATIC_HOME_PATCH_STATE_ATTR = 'data-static-home-patch-state'
export const STATIC_HOME_PAINT_ATTR = 'data-home-paint'
export const STATIC_PAGE_ROOT_ATTR = 'data-static-page-root'

export const STATIC_SHELL_HEADER_REGION = 'header'
export const STATIC_SHELL_MAIN_REGION = 'main'
export const STATIC_SHELL_DOCK_REGION = 'dock'

export const STATIC_SHELL_SEED_SCRIPT_ID = 'prom-static-shell-seed'
export const STATIC_HOME_DATA_SCRIPT_ID = 'prom-static-home-data'
export const STATIC_FRAGMENT_DATA_SCRIPT_ID = 'prom-static-fragment-data'
export const STATIC_ISLAND_DATA_SCRIPT_ID = 'prom-static-island-data'

const normalizeStaticShellPath = (path: string) => {
  const trimmed = (path || '/').trim()
  if (!trimmed || trimmed === '/') return '/'
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

export const toCanonicalStaticShellHref = (href: string) => {
  if (!href || !href.startsWith('/')) return href
  try {
    const url = new URL(href, 'https://prometheus.local')
    const routeConfig = getStaticShellRouteConfig(url.pathname)
    if (!routeConfig) {
      return `${url.pathname}${url.search}${url.hash}`
    }
    if (routeConfig.path === '/') {
      url.pathname = '/'
    } else {
      url.pathname = `${routeConfig.path}/`
    }
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return href
  }
}

const staticShellRouteConfigs = [
  {
    path: '/',
    routeKind: HOME_STATIC_ROUTE_KIND,
    bootstrapMode: 'home-static',
    authPolicy: 'public',
    snapshotKey: '/'
  },
  {
    path: '/store',
    routeKind: FRAGMENT_STATIC_ROUTE_KIND,
    bootstrapMode: 'fragment-static',
    authPolicy: 'public',
    snapshotKey: '/store'
  },
  {
    path: '/lab',
    routeKind: FRAGMENT_STATIC_ROUTE_KIND,
    bootstrapMode: 'fragment-static',
    authPolicy: 'public',
    snapshotKey: '/lab'
  },
  {
    path: '/login',
    routeKind: ISLAND_STATIC_ROUTE_KIND,
    bootstrapMode: 'island-static',
    authPolicy: 'guest',
    snapshotKey: '/login'
  },
  {
    path: '/chat',
    routeKind: FRAGMENT_STATIC_ROUTE_KIND,
    bootstrapMode: 'fragment-static',
    authPolicy: 'protected',
    snapshotKey: '/chat'
  },
  {
    path: '/dashboard',
    routeKind: ISLAND_STATIC_ROUTE_KIND,
    bootstrapMode: 'island-static',
    authPolicy: 'protected',
    snapshotKey: '/dashboard'
  },
  {
    path: '/profile',
    routeKind: ISLAND_STATIC_ROUTE_KIND,
    bootstrapMode: 'island-static',
    authPolicy: 'protected',
    snapshotKey: '/profile'
  },
  {
    path: '/settings',
    routeKind: ISLAND_STATIC_ROUTE_KIND,
    bootstrapMode: 'island-static',
    authPolicy: 'protected',
    snapshotKey: '/settings'
  },
  {
    path: '/offline',
    routeKind: FRAGMENT_STATIC_ROUTE_KIND,
    bootstrapMode: 'fragment-static',
    authPolicy: 'public',
    snapshotKey: '/offline'
  }
] as const satisfies readonly StaticShellRouteConfig[]

const staticShellRouteMap = new Map<string, StaticShellRouteConfig>(
  staticShellRouteConfigs.map((config) => [config.path, config])
)

export const getStaticShellRouteConfig = (path: string): StaticShellRouteConfig | null =>
  staticShellRouteMap.get(normalizeStaticShellPath(path)) ?? null

export const getStaticShellRouteConfigs = () => Array.from(staticShellRouteConfigs)

export const isHomeStaticPath = (path: string) => normalizeStaticShellPath(path) === HOME_STATIC_ROUTE_PATH
export const isStaticShellPath = (path: string) => Boolean(getStaticShellRouteConfig(path))
export const isIslandStaticPath = (path: string) =>
  getStaticShellRouteConfig(path)?.routeKind === ISLAND_STATIC_ROUTE_KIND
export const normalizeStaticShellRoutePath = normalizeStaticShellPath
