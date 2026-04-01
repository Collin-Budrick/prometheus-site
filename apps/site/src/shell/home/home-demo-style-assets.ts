const homeDemoSharedStylesheetName = 'home-demo-shared.css'
const homeDemoSharedStylesheetFallbackPath =
  'build/static-shell/apps/site/src/shell/home/home-demo-shared.css'
const homeDemoSharedStylesheetCache = new Map<string, string>()

type HomeDemoStyleImportMetaEnv = {
  BASE_URL?: string
}

const resolveCwd = () =>
  typeof process !== 'undefined' && typeof process.cwd === 'function'
    ? process.cwd()
    : ''

const resolveNodeRequire = () =>
  typeof require === 'function' ? (require as (id: string) => unknown) : null

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const normalizePublicBase = (value: string) => {
  if (value === './') return './'
  if (value.startsWith('/')) {
    return value.endsWith('/') ? value : `${value}/`
  }
  return `/${value.replace(/^\/+/, '').replace(/\/?$/, '/')}`
}

const resolveFallbackHomeDemoSharedStylesheetHref = () => {
  const baseUrl =
    typeof import.meta !== 'undefined'
      ? (import.meta as ImportMeta & { env?: HomeDemoStyleImportMetaEnv }).env?.BASE_URL
      : undefined
  const normalizedBase = normalizePublicBase(baseUrl ?? '/')
  return normalizedBase === './'
    ? `./${homeDemoSharedStylesheetFallbackPath}`
    : `${normalizedBase}${homeDemoSharedStylesheetFallbackPath}`
}

const homeDemoSharedStylesheetHref = resolveFallbackHomeDemoSharedStylesheetHref()

const resolveManifestAssetHref = (assets: unknown) => {
  if (!isRecord(assets)) return null

  for (const [assetPath, entry] of Object.entries(assets)) {
    if (!assetPath.startsWith('assets/')) continue
    if (!isRecord(entry) || entry.name !== homeDemoSharedStylesheetName) continue
    return `/${assetPath.replaceAll('\\', '/')}`
  }

  return null
}

export const resolveBuiltHomeDemoSharedStylesheetHref = (cwd = resolveCwd()) => {
  if (typeof document !== 'undefined') {
    return null
  }

  try {
    const requireModule = resolveNodeRequire()
    if (!requireModule) {
      return null
    }
    const { readFileSync } = requireModule(['node', 'fs'].join(':')) as typeof import('node:fs')
    const path = requireModule(['node', 'path'].join(':')) as typeof import('node:path')
    const manifestPath = path.resolve(cwd, 'dist', 'q-manifest.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
    const nestedAssetHref = resolveManifestAssetHref(manifest.assets)
    if (nestedAssetHref) return nestedAssetHref

    const flatAssetHref = resolveManifestAssetHref(manifest)
    if (flatAssetHref) return flatAssetHref
  } catch {
    // Fall back to the static-shell stylesheet when the manifest is unavailable.
  }

  return null
}

export const resolveHomeDemoSharedStylesheetHref = (cwd = resolveCwd()) => {
  const cachedHref = homeDemoSharedStylesheetCache.get(cwd)
  if (cachedHref) return cachedHref

  const resolvedHref =
    resolveBuiltHomeDemoSharedStylesheetHref(cwd) ?? homeDemoSharedStylesheetHref
  homeDemoSharedStylesheetCache.set(cwd, resolvedHref)
  return resolvedHref
}

export const resetHomeDemoSharedStylesheetHrefCacheForTests = () => {
  homeDemoSharedStylesheetCache.clear()
}

export { homeDemoSharedStylesheetHref }
