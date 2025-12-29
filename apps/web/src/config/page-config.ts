import { defaultLocale } from 'compiled-i18n'
import pageConfig from './page-config.json'
import { stripLocalePrefix, supportedLocales } from '../routes/_shared/locale/locale-routing'

type RenderMode = 'ssr' | 'ssg'
type SpeculationMode = 'prefetch' | 'prerender' | 'none'

type RouteConfig = {
  render?: RenderMode
  speculation?: SpeculationMode
}

type SpeculationConfigSnapshot = {
  defaultSpeculation: SpeculationMode
  routes: Record<string, SpeculationMode>
}

type PageConfigFile = {
  defaults?: RouteConfig
  routes?: Record<string, RouteConfig>
}

const config = pageConfig as PageConfigFile

const normalizePath = (pathname: string) => {
  const stripped = stripLocalePrefix(pathname) || '/'
  if (!stripped.startsWith('/')) return `/${stripped}`
  if (stripped.length > 1 && stripped.endsWith('/')) return stripped.slice(0, -1)
  return stripped
}

const normalizeConfigPath = (pathname: string) => {
  if (!pathname) return '/'
  if (!pathname.startsWith('/')) pathname = `/${pathname}`
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1)
  return pathname
}

const resolveDefaultSpeculation = (): SpeculationMode => config.defaults?.speculation ?? 'prefetch'

export const getPageConfig = (pathname: string): RouteConfig => {
  const normalized = normalizePath(pathname)
  const defaults = config.defaults ?? {}
  const overrides = config.routes?.[normalized] ?? {}
  return { ...defaults, ...overrides }
}

export const getSpeculationMode = (pathname: string): SpeculationMode => {
  const config = getPageConfig(pathname)
  return config.speculation ?? resolveDefaultSpeculation()
}

export const getPageSpeculation = (pathname: string): Exclude<SpeculationMode, 'none'> | undefined => {
  const speculation = getSpeculationMode(pathname)
  if (!speculation || speculation === 'none') return undefined
  return speculation
}

export const getPrerenderRoutes = () => {
  const defaults = config.defaults ?? {}
  const routes = config.routes ?? {}
  const ssgPaths = Object.entries(routes)
    .filter(([, routeConfig]) => (routeConfig.render ?? defaults.render) === 'ssg')
    .map(([path]) => normalizeConfigPath(path))

  const localesToRender = supportedLocales?.length ? supportedLocales : [defaultLocale]
  const prerendered = new Set<string>()

  ssgPaths.forEach((path) => {
    localesToRender.forEach((locale) => {
      const localizedPath = path === '/' ? `/${locale}` : `/${locale}${path}`
      prerendered.add(localizedPath)
    })
  })

  return Array.from(prerendered).sort()
}

export const getSpeculationConfigSnapshot = (): SpeculationConfigSnapshot => {
  const defaultSpeculation = resolveDefaultSpeculation()
  const routes: Record<string, SpeculationMode> = {}
  const entries = Object.entries(config.routes ?? {})
  entries.forEach(([path, routeConfig]) => {
    const normalized = normalizeConfigPath(path)
    routes[normalized] = routeConfig.speculation ?? defaultSpeculation
  })

  return {
    defaultSpeculation,
    routes
  }
}

export const prerenderRoutes = getPrerenderRoutes()
export type PrerenderRoute = (typeof prerenderRoutes)[number]
