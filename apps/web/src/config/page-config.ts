import pageConfig from './page-config.json'
import { stripLocalePrefix } from '../routes/locale-routing'

type RenderMode = 'ssr' | 'ssg'
type SpeculationMode = 'prefetch' | 'prerender' | 'none'

type RouteConfig = {
  render?: RenderMode
  speculation?: SpeculationMode
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

export const getPageConfig = (pathname: string): RouteConfig => {
  const normalized = normalizePath(pathname)
  const defaults = config.defaults ?? {}
  const overrides = config.routes?.[normalized] ?? {}
  return { ...defaults, ...overrides }
}

export const getPageSpeculation = (pathname: string): Exclude<SpeculationMode, 'none'> | undefined => {
  const speculation = getPageConfig(pathname).speculation
  if (!speculation || speculation === 'none') return undefined
  return speculation
}

export const getPrerenderRoutes = () => {
  const defaults = config.defaults ?? {}
  const routes = config.routes ?? {}
  return Object.entries(routes)
    .filter(([, routeConfig]) => (routeConfig.render ?? defaults.render) === 'ssg')
    .map(([path]) => normalizeConfigPath(path))
}
