import homeStaticEagerStylesheetHref from './home-static-eager.css?url'

const homeStaticEagerStylesheetName = 'home-static-eager.css'
const homeStaticEagerStylesheetTextCache = new Map<string, string>()

type HomeStyleImportMetaEnv = {
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

const resolveFallbackHomeStaticEagerStylesheetHref = () => {
  const baseUrl =
    typeof import.meta !== 'undefined'
      ? (import.meta as ImportMeta & { env?: HomeStyleImportMetaEnv }).env?.BASE_URL
      : undefined
  const normalizedBase = normalizePublicBase(baseUrl ?? '/')
  return normalizedBase === './'
    ? `.${homeStaticEagerStylesheetHref}`
    : homeStaticEagerStylesheetHref
}

const resolveManifestAssetPath = (assets: unknown, assetName: string) => {
  if (!isRecord(assets)) return null

  for (const [assetPath, entry] of Object.entries(assets)) {
    if (!assetPath.startsWith('assets/')) continue
    if (!isRecord(entry) || entry.name !== assetName) continue
    return assetPath.replaceAll('\\', '/')
  }

  return null
}

const resolveBuiltHomeStaticEagerStylesheetAssetPath = (cwd = resolveCwd()) => {
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
    const nestedAssetPath = resolveManifestAssetPath(
      (manifest as { assets?: unknown }).assets,
      homeStaticEagerStylesheetName
    )
    if (nestedAssetPath) return nestedAssetPath

    return resolveManifestAssetPath(manifest, homeStaticEagerStylesheetName)
  } catch {
    return null
  }
}

export const resolveBuiltHomeStaticEagerStylesheetHref = (cwd = resolveCwd()) => {
  const assetPath = resolveBuiltHomeStaticEagerStylesheetAssetPath(cwd)
  return assetPath ? `/${assetPath}` : null
}

export const resolveBuiltHomeStaticEagerStylesheetText = (cwd = resolveCwd()) => {
  if (typeof document !== 'undefined') {
    return null
  }

  const cachedText = homeStaticEagerStylesheetTextCache.get(cwd)
  if (cachedText) return cachedText

  const assetPath = resolveBuiltHomeStaticEagerStylesheetAssetPath(cwd)
  if (!assetPath) {
    return null
  }

  try {
    const requireModule = resolveNodeRequire()
    if (!requireModule) {
      return null
    }
    const { readFileSync } = requireModule(['node', 'fs'].join(':')) as typeof import('node:fs')
    const path = requireModule(['node', 'path'].join(':')) as typeof import('node:path')
    const stylesheetPath = path.resolve(cwd, 'dist', assetPath)
    const stylesheetText = readFileSync(stylesheetPath, 'utf8')
    homeStaticEagerStylesheetTextCache.set(cwd, stylesheetText)
    return stylesheetText
  } catch {
    return null
  }
}

export const resolveInlineHomeStaticEagerStylesheet = (cwd = resolveCwd()) =>
  resolveBuiltHomeStaticEagerStylesheetText(cwd)

export const resetHomeStaticEagerStylesheetCachesForTests = () => {
  homeStaticEagerStylesheetTextCache.clear()
}

export {
  homeStaticEagerStylesheetHref,
  resolveFallbackHomeStaticEagerStylesheetHref
}
