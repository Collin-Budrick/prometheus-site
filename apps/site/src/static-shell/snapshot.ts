import type { Lang } from '../lang'
import type { StaticShellSnapshotManifest } from './seed'
import { normalizeStaticShellRoutePath } from './constants'

export const STATIC_SHELL_SNAPSHOT_MANIFEST_PATH = 'build/static-shell/snapshots/manifest.json'

export const toStaticSnapshotKey = (path: string) => normalizeStaticShellRoutePath(path)

export const toStaticSnapshotAssetId = (path: string) => {
  const normalized = toStaticSnapshotKey(path)
  if (normalized === '/') return '__root__'
  return encodeURIComponent(normalized.slice(1)).replace(/%/g, '_')
}

export const toStaticSnapshotAssetPath = (path: string, lang: Lang) =>
  `build/static-shell/snapshots/${toStaticSnapshotAssetId(path)}.${lang}.json`

export const createStaticSnapshotManifestEntry = (
  manifest: StaticShellSnapshotManifest,
  path: string,
  lang: Lang
) => {
  const snapshotKey = toStaticSnapshotKey(path)
  const nextEntry = manifest[snapshotKey] ?? {}
  nextEntry[lang] = toStaticSnapshotAssetPath(snapshotKey, lang)
  manifest[snapshotKey] = nextEntry
}
