import { STATIC_SHELL_SEED_SCRIPT_ID } from './constants'

export const STATIC_SHELL_ASSET_VERSION_QUERY_PARAM = 'v'
const STATIC_SHELL_BUNDLE_MARKER = 'build/static-shell/'

type ScriptLike = {
  getAttribute?: (name: string) => string | null
  src?: string
}

type StaticShellSeedLike = {
  buildVersion?: string | null
}

type ResolveStaticAssetVersionOptions = {
  version?: string | null
  scripts?: ArrayLike<ScriptLike> | Iterable<ScriptLike>
  doc?: Pick<Document, 'getElementById'> | null
}

const parseStaticAssetVersionFromUrl = (value: string) => {
  if (!value) return null
  try {
    const url = new URL(value, 'https://prometheus.local')
    return url.searchParams.get(STATIC_SHELL_ASSET_VERSION_QUERY_PARAM)
  } catch {
    return null
  }
}

const readStaticShellSeed = (
  doc: Pick<Document, 'getElementById'> | null = typeof document !== 'undefined' ? document : null
) => {
  if (!doc || typeof doc.getElementById !== 'function') {
    return null
  }
  const element = doc?.getElementById(STATIC_SHELL_SEED_SCRIPT_ID)
  if (!element || typeof element !== 'object' || !('textContent' in element) || !element.textContent) return null
  try {
    return JSON.parse(element.textContent) as StaticShellSeedLike
  } catch {
    return null
  }
}

const readStaticAssetVersionFromScripts = (
  scripts: ArrayLike<ScriptLike> | Iterable<ScriptLike> | undefined
) => {
  if (!scripts) return null
  for (const script of Array.from(scripts)) {
    const src = script.src ?? script.getAttribute?.('src') ?? ''
    if (!src.includes(STATIC_SHELL_BUNDLE_MARKER)) continue
    const version = parseStaticAssetVersionFromUrl(src)
    if (version) return version
  }
  return null
}

export const appendStaticAssetVersion = (value: string, version?: string | null) => {
  if (!value || !version) return value

  const hashIndex = value.indexOf('#')
  const hash = hashIndex >= 0 ? value.slice(hashIndex) : ''
  const withoutHash = hashIndex >= 0 ? value.slice(0, hashIndex) : value
  const queryIndex = withoutHash.indexOf('?')
  const pathname = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash
  const query = new URLSearchParams(queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : '')
  query.set(STATIC_SHELL_ASSET_VERSION_QUERY_PARAM, version)
  const serialized = query.toString()
  return `${pathname}${serialized ? `?${serialized}` : ''}${hash}`
}

export const resolveStaticAssetVersion = ({
  version,
  scripts,
  doc = typeof document !== 'undefined' ? document : null
}: ResolveStaticAssetVersionOptions = {}) =>
  version ??
  readStaticAssetVersionFromScripts(scripts) ??
  readStaticShellSeed(doc)?.buildVersion ??
  null
