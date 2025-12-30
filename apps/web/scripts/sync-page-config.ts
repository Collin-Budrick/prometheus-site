import fs from 'node:fs/promises'
import path from 'node:path'

type RouteConfig = {
  render?: 'ssr' | 'ssg'
  speculation?: 'prefetch' | 'prerender' | 'none'
}

type PageConfigFile = {
  defaults?: RouteConfig
  routes?: Record<string, RouteConfig>
}

const projectRoot = process.cwd()
const routesRoot = path.join(projectRoot, 'src', 'routes')
const configPath = path.join(projectRoot, 'src', 'config', 'page-config.json')
const routeExtensions = new Set(['.tsx', '.ts', '.jsx', '.js', '.mdx', '.md'])

const isDynamicSegment = (segment: string) => segment.startsWith('[') && segment.endsWith(']')
const isPathlessSegment = (segment: string) => segment.startsWith('(') && segment.endsWith(')')

const normalizeRoute = (segments: string[]) => {
  const cleaned = segments.filter((segment) => segment && segment !== '.' && !isPathlessSegment(segment))
  if (cleaned.some(isDynamicSegment)) return null
  if (cleaned.length === 0) return '/'
  return `/${cleaned.join('/')}`
}

const collectIndexRoutes = async () => {
  const routes = new Set<string>()
  const queue: string[] = [routesRoot]

  while (queue.length > 0) {
    const current = queue.pop()
    if (!current) continue

    const entries = await fs.readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.')) continue
        queue.push(path.join(current, entry.name))
        continue
      }

      if (!entry.isFile()) continue
      const ext = path.extname(entry.name)
      if (!routeExtensions.has(ext)) continue
      const base = path.basename(entry.name, ext)
      if (base !== 'index') continue

      const relative = path.relative(routesRoot, path.join(current, entry.name))
      const dirName = path.dirname(relative)
      const segments = dirName === '.' ? [] : dirName.split(path.sep).filter(Boolean)
      const route = normalizeRoute(segments)
      if (!route) continue
      routes.add(route)
    }
  }

  return Array.from(routes).sort()
}

const syncPageConfig = async () => {
  const raw = await fs.readFile(configPath, 'utf8')
  const parsed = JSON.parse(raw) as PageConfigFile
  const defaults = parsed.defaults ?? {}
  const existingRoutes = parsed.routes ?? {}
  const discovered = await collectIndexRoutes()

  const updatedRoutes: Record<string, RouteConfig> = { ...existingRoutes }
  const added: string[] = []

  for (const route of discovered) {
    if (route in existingRoutes) continue
    updatedRoutes[route] = { ...defaults }
    added.push(route)
  }

  if (added.length === 0) return

  const nextConfig: PageConfigFile = {
    ...parsed,
    routes: updatedRoutes
  }

  await fs.writeFile(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8')
  console.log(`page-config: added ${added.length} route${added.length === 1 ? '' : 's'} (${added.join(', ')})`)
}

await syncPageConfig()
