import { type DocumentLink } from '@builder.io/qwik-city'
import globalDeferredStylesheetHref from '@prometheus/ui/global-deferred.css?url'

type HeadLink = DocumentLink

const globalDeferredStylesheetName = 'global-deferred.css'
const globalDeferredStylesheetCache = new Map<string, string>()

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
    if (!isRecord(entry) || entry.name !== globalDeferredStylesheetName) continue
    return `/${assetPath.replaceAll('\\', '/')}`
  }

  return null
}

export const resolveBuiltGlobalDeferredStylesheetHref = (cwd = resolveCwd()) => {
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

export const resolveGlobalDeferredStylesheetHref = (cwd = resolveCwd()) => {
  const cachedHref = globalDeferredStylesheetCache.get(cwd)
  if (cachedHref) return cachedHref

  const resolvedHref = resolveBuiltGlobalDeferredStylesheetHref(cwd) ?? globalDeferredStylesheetHref
  globalDeferredStylesheetCache.set(cwd, resolvedHref)
  return resolvedHref
}

export const resetGlobalDeferredStylesheetHrefCacheForTests = () => {
  globalDeferredStylesheetCache.clear()
}

export const buildGlobalStylesheetLinks = (links: HeadLink[] = [], cwd = resolveCwd()): HeadLink[] => [
  {
    rel: 'stylesheet',
    href: resolveGlobalDeferredStylesheetHref(cwd)
  },
  ...links
]

export { globalDeferredStylesheetHref }
