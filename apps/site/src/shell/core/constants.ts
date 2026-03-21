import { hasTemplateFeature, type ResolvedTemplateFeatures, type TemplateFeatureId } from '@prometheus/template-config'
import { siteTemplateConfig } from '../../template-features'

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
  feature?: TemplateFeatureId
}

type TemplateSelection = Pick<ResolvedTemplateFeatures, 'features'>

export const STATIC_ROUTE_ATTR = 'data-static-route'
export const STATIC_SHELL_REGION_ATTR = 'data-static-shell-region'
export const STATIC_DOCK_ROOT_ATTR = 'data-static-dock-root'
export const STATIC_FRAGMENT_CARD_ATTR = 'data-static-fragment-card'
export const STATIC_FRAGMENT_BODY_ATTR = 'data-static-fragment-body'
export const STATIC_FRAGMENT_VERSION_ATTR = 'data-fragment-version'
export const STATIC_FRAGMENT_WIDTH_BUCKET_ATTR = 'data-fragment-width-bucket'
export const STATIC_FRAGMENT_WIDTH_BUCKET_MOBILE_ATTR = 'data-fragment-width-bucket-mobile'
export const STATIC_FRAGMENT_LOCKED_ATTR = 'data-static-fragment-locked'
export const STATIC_FRAGMENT_PAINT_ATTR = 'data-static-fragment-paint'
export const STATIC_HOME_FRAGMENT_KIND_ATTR = 'data-static-home-fragment-kind'
export const STATIC_HOME_LCP_STABLE_ATTR = 'data-static-home-lcp-stable'
export const STATIC_HOME_PREVIEW_VISIBLE_ATTR = 'data-static-home-preview-visible'
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
export const STATIC_HOME_WORKER_DATA_SCRIPT_ID = 'prom-static-home-worker-data'
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
    snapshotKey: '/store',
    feature: 'store'
  },
  {
    path: '/lab',
    routeKind: FRAGMENT_STATIC_ROUTE_KIND,
    bootstrapMode: 'fragment-static',
    authPolicy: 'public',
    snapshotKey: '/lab',
    feature: 'lab'
  },
  {
    path: '/login',
    routeKind: ISLAND_STATIC_ROUTE_KIND,
    bootstrapMode: 'island-static',
    authPolicy: 'guest',
    snapshotKey: '/login',
    feature: 'auth'
  },
  {
    path: '/chat',
    routeKind: FRAGMENT_STATIC_ROUTE_KIND,
    bootstrapMode: 'fragment-static',
    authPolicy: 'protected',
    snapshotKey: '/chat',
    feature: 'messaging'
  },
  {
    path: '/dashboard',
    routeKind: ISLAND_STATIC_ROUTE_KIND,
    bootstrapMode: 'island-static',
    authPolicy: 'protected',
    snapshotKey: '/dashboard',
    feature: 'account'
  },
  {
    path: '/profile',
    routeKind: ISLAND_STATIC_ROUTE_KIND,
    bootstrapMode: 'island-static',
    authPolicy: 'protected',
    snapshotKey: '/profile',
    feature: 'account'
  },
  {
    path: '/settings',
    routeKind: ISLAND_STATIC_ROUTE_KIND,
    bootstrapMode: 'island-static',
    authPolicy: 'protected',
    snapshotKey: '/settings',
    feature: 'account'
  },
  {
    path: '/offline',
    routeKind: FRAGMENT_STATIC_ROUTE_KIND,
    bootstrapMode: 'fragment-static',
    authPolicy: 'public',
    snapshotKey: '/offline',
    feature: 'pwa'
  }
] as const satisfies readonly StaticShellRouteConfig[]

const staticShellRouteMap = new Map<string, StaticShellRouteConfig>(
  staticShellRouteConfigs.map((config) => [config.path, config])
)

const isStaticShellRouteEnabled = (
  config: StaticShellRouteConfig,
  template: TemplateSelection = siteTemplateConfig
) => !config.feature || hasTemplateFeature(template, config.feature)

export const getStaticShellRouteConfig = (
  path: string,
  template: TemplateSelection = siteTemplateConfig
): StaticShellRouteConfig | null => {
  const routeConfig = staticShellRouteMap.get(normalizeStaticShellPath(path)) ?? null
  if (!routeConfig) return null
  return isStaticShellRouteEnabled(routeConfig, template) ? routeConfig : null
}

export const getStaticShellRouteConfigs = (template: TemplateSelection = siteTemplateConfig) =>
  staticShellRouteConfigs.filter((config) => isStaticShellRouteEnabled(config, template))

export const isHomeStaticPath = (path: string) => normalizeStaticShellPath(path) === HOME_STATIC_ROUTE_PATH
export const isStaticShellPath = (path: string, template: TemplateSelection = siteTemplateConfig) =>
  Boolean(getStaticShellRouteConfig(path, template))
export const isIslandStaticPath = (path: string, template: TemplateSelection = siteTemplateConfig) =>
  getStaticShellRouteConfig(path, template)?.routeKind === ISLAND_STATIC_ROUTE_KIND
export const normalizeStaticShellRoutePath = normalizeStaticShellPath
