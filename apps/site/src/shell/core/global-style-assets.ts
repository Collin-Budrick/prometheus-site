import { readFileSync } from 'node:fs'
import path from 'node:path'
import { type DocumentLink } from '@builder.io/qwik-city'
import globalDeferredStylesheetHref from '@prometheus/ui/global-deferred.css?url'

type HeadLink = DocumentLink

const globalDeferredStylesheetName = 'global-deferred.css'
const globalDeferredStylesheetCache = new Map<string, string>()

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

export const resolveBuiltGlobalDeferredStylesheetHref = (cwd = process.cwd()) => {
  const manifestPath = path.resolve(cwd, 'dist', 'q-manifest.json')

  try {
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

export const resolveGlobalDeferredStylesheetHref = (cwd = process.cwd()) => {
  const cachedHref = globalDeferredStylesheetCache.get(cwd)
  if (cachedHref) return cachedHref

  const resolvedHref = resolveBuiltGlobalDeferredStylesheetHref(cwd) ?? globalDeferredStylesheetHref
  globalDeferredStylesheetCache.set(cwd, resolvedHref)
  return resolvedHref
}

export const resetGlobalDeferredStylesheetHrefCacheForTests = () => {
  globalDeferredStylesheetCache.clear()
}

export const buildGlobalStylesheetLinks = (links: HeadLink[] = [], cwd = process.cwd()): HeadLink[] => [
  {
    rel: 'stylesheet',
    href: resolveGlobalDeferredStylesheetHref(cwd)
  },
  ...links
]

export { globalDeferredStylesheetHref }
