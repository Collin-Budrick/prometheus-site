import type { Lang } from '../lang'
import { resolveStaticShellLangParam } from './lang-param'
import type { StaticShellSnapshot, StaticShellSnapshotManifest } from './seed'
import {
  STATIC_SHELL_DOCK_REGION,
  STATIC_SHELL_HEADER_REGION,
  STATIC_SHELL_MAIN_REGION,
  STATIC_SHELL_REGION_ATTR
} from './constants'
import { STATIC_SHELL_SNAPSHOT_MANIFEST_PATH } from './snapshot'

const STATIC_LANG_STORAGE_KEYS = ['prometheus-lang', 'prometheus:pref:locale'] as const
const STATIC_LANG_COOKIE_KEY = 'prometheus-lang'
const STATIC_SHELL_BUNDLE_MARKER = 'build/static-shell/'

let snapshotManifestPromise: Promise<StaticShellSnapshotManifest> | null = null
const snapshotCache = new Map<string, Promise<StaticShellSnapshot>>()

const readJson = async <T,>(input: RequestInfo | URL) => {
  const response = await fetch(input, {
    credentials: 'same-origin',
    headers: {
      accept: 'application/json'
    }
  })
  if (!response.ok) {
    throw new Error(`Snapshot fetch failed: ${response.status}`)
  }
  return (await response.json()) as T
}

const readCookieValue = (key: string) => {
  const parts = document.cookie.split(';')
  for (const part of parts) {
    const [name, raw] = part.trim().split('=')
    if (name !== key) continue
    try {
      return raw ? decodeURIComponent(raw) : ''
    } catch {
      return null
    }
  }
  return null
}

const resolveStaticAssetBase = () => {
  const script = Array.from(document.scripts).find((entry) => {
    const src = entry.getAttribute('src') ?? ''
    return src.includes(STATIC_SHELL_BUNDLE_MARKER)
  })
  const scriptSrc = script?.src
  if (!scriptSrc) {
    return `${window.location.origin}/`
  }
  const markerIndex = scriptSrc.indexOf(STATIC_SHELL_BUNDLE_MARKER)
  if (markerIndex < 0) {
    return `${window.location.origin}/`
  }
  return scriptSrc.slice(0, markerIndex)
}

const toSnapshotUrl = (assetPath: string) => new URL(assetPath, resolveStaticAssetBase()).toString()

const parseHtmlFragment = (html: string) => {
  const template = document.createElement('template')
  template.innerHTML = html.trim()
  const next = template.content.firstElementChild
  return next instanceof HTMLElement ? next : null
}

const replaceStaticShellRegionHtml = (region: string, html: string) => {
  const current = document.querySelector<HTMLElement>(`[${STATIC_SHELL_REGION_ATTR}="${region}"]`)
  const next = parseHtmlFragment(html)
  if (!current || !next) return
  current.replaceWith(next)
}

export const resolvePreferredStaticShellLang = (fallback: Lang) => {
  const url = new URL(window.location.href)
  const paramLang = resolveStaticShellLangParam(url.searchParams.get('lang'))
  if (paramLang) return paramLang

  for (const key of STATIC_LANG_STORAGE_KEYS) {
    try {
      const stored = resolveStaticShellLangParam(window.localStorage.getItem(key))
      if (stored) return stored
    } catch {
      // Ignore storage access failures.
    }
  }

  const cookieLang = resolveStaticShellLangParam(readCookieValue(STATIC_LANG_COOKIE_KEY))
  if (cookieLang) return cookieLang
  return fallback
}

export const loadStaticShellSnapshotManifest = async () => {
  if (!snapshotManifestPromise) {
    snapshotManifestPromise = readJson<StaticShellSnapshotManifest>(
      toSnapshotUrl(STATIC_SHELL_SNAPSHOT_MANIFEST_PATH)
    )
  }
  return await snapshotManifestPromise
}

export const loadStaticShellSnapshot = async (snapshotKey: string, lang: Lang) => {
  const cacheKey = `${snapshotKey}|${lang}`
  const cached = snapshotCache.get(cacheKey)
  if (cached) {
    return await cached
  }

  const nextPromise = (async () => {
    const manifest = await loadStaticShellSnapshotManifest()
    const assetPath = manifest[snapshotKey]?.[lang]
    if (!assetPath) {
      throw new Error(`Missing static snapshot for ${snapshotKey} (${lang})`)
    }
    return await readJson<StaticShellSnapshot>(toSnapshotUrl(assetPath))
  })()
  snapshotCache.set(cacheKey, nextPromise)
  return await nextPromise
}

export const applyStaticShellSnapshot = (snapshot: StaticShellSnapshot) => {
  replaceStaticShellRegionHtml(STATIC_SHELL_HEADER_REGION, snapshot.regions.header)
  replaceStaticShellRegionHtml(STATIC_SHELL_MAIN_REGION, snapshot.regions.main)
  replaceStaticShellRegionHtml(STATIC_SHELL_DOCK_REGION, snapshot.regions.dock)
  document.title = snapshot.title
}

export const updateStaticShellUrlLang = (lang: Lang) => {
  const url = new URL(window.location.href)
  url.searchParams.set('lang', lang)
  const nextUrl = `${url.pathname}${url.search}${url.hash}`
  const state = window.history.state && typeof window.history.state === 'object' ? { ...window.history.state } : {}
  window.history.replaceState(state, '', nextUrl)
}
