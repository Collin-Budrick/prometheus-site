import homeDemoSharedStylesheetHref from './home-demo-shared.css?url'

const homeDemoSharedStylesheetName = 'home-demo-shared.css'
const homeDemoSharedStylesheetCache = new Map<string, string>()

const resolveCwd = () =>
  typeof process !== 'undefined' && typeof process.cwd === 'function'
    ? process.cwd()
    : ''

const resolveNodeRequire = () =>
  typeof require === 'function' ? (require as (id: string) => unknown) : null

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

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
    // Fall back to the build-time import when the manifest is unavailable.
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
