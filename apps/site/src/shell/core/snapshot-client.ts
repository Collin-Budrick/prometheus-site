import type { Lang } from '../../lang/types'
import { setTrustedTemplateHtml } from '../../security/client'
import {
  parseUserFragmentCacheScope,
  resolveCurrentFragmentUserCacheKey,
  resolveFragmentCacheScope,
} from '../../fragment/cache-scope'
import { resolveStaticShellLangParam } from './lang-param'
import type { StaticShellSnapshot, StaticShellSnapshotManifest } from './seed'
import { renderDockRegionHtml, syncStaticDockMarkup } from '../home/home-dock-dom'
import {
  getStaticShellRouteConfig,
  STATIC_ROUTE_ATTR,
  STATIC_SHELL_DOCK_REGION,
  STATIC_SHELL_HEADER_REGION,
  STATIC_SHELL_MAIN_REGION,
  STATIC_SHELL_REGION_ATTR
} from './constants'
import { resolveStaticAssetUrl } from './static-asset-url'
import {
  STATIC_SHELL_SNAPSHOT_MANIFEST_PATH,
  toStaticSnapshotAssetPath,
  toStaticSnapshotKey
} from './snapshot'
import type { StaticDockState } from './seed-client'
import { replayStaticSnapshotReadyStagger } from './snapshot-ready-stagger'
import {
  parkResidentSubtreesWithin,
  restoreResidentSubtreesWithin
} from '../../shared/resident-fragment-manager'

const STATIC_LANG_STORAGE_KEYS = ['prometheus-lang', 'prometheus:pref:locale'] as const
const STATIC_LANG_COOKIE_KEY = 'prometheus-lang'
const SESSION_SNAPSHOT_STORAGE_PREFIX = 'prometheus:static-shell:session-snapshot:v1:'
const HYDRATED_WIDGET_ATTR_RE = /\sdata-fragment-widget-hydrated=(["'])true\1/gi
const RESIDENT_STATE_ATTR_RE = /\sdata-fragment-resident-state=(["'])[^"']*\1/gi
const LAYOUT_SHELL_SELECTOR = '.layout-shell'
const MANAGED_HEAD_SELECTOR = [
  'meta[name="prom-home-deferred-global-style"]',
  'link[rel="stylesheet"][href*="global-deferred.css"]',
  'link[rel="stylesheet"][data-home-deferred-global-style-href]',
  'link[rel="stylesheet"][data-fragment-css]',
  'style[data-src]'
].join(',')

let snapshotManifestPromise: Promise<StaticShellSnapshotManifest> | null = null
const snapshotCache = new Map<string, Promise<StaticShellSnapshot>>()
const liveSessionSnapshotCache = new Map<string, StaticShellSnapshot>()

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

const readText = async (input: RequestInfo | URL) => {
  const response = await fetch(input, {
    credentials: 'same-origin',
    headers: {
      accept: 'text/html'
    }
  })
  if (!response.ok) {
    throw new Error(`Snapshot HTML fetch failed: ${response.status}`)
  }
  return await response.text()
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const extractHtmlTitle = (html: string) => {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i)
  return match?.[1]?.trim() ?? ''
}

const extractElementByAttribute = (html: string, attributeName: string, attributeValue: string) => {
  const opener = new RegExp(
    `<([a-zA-Z][\\w:-]*)\\b[^>]*\\b${escapeRegex(attributeName)}=(["'])${escapeRegex(attributeValue)}\\2[^>]*>`,
    'i'
  )
  const match = opener.exec(html)
  if (!match || !match[1]) return null

  const tagName = match[1]
  const tagPattern = new RegExp(`<(/?)${escapeRegex(tagName)}\\b[^>]*>`, 'gi')
  tagPattern.lastIndex = match.index
  let depth = 0

  for (;;) {
    const tagMatch = tagPattern.exec(html)
    if (!tagMatch) break
    const source = tagMatch[0]
    const closing = tagMatch[1] === '/'
    const selfClosing = source.endsWith('/>')

    if (!closing && !selfClosing) {
      depth += 1
    } else if (closing) {
      depth -= 1
    }

    if (depth === 0) {
      return html.slice(match.index, tagPattern.lastIndex)
    }
  }

  return null
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

const toSnapshotUrl = (assetPath: string) => resolveStaticAssetUrl(assetPath)

const buildSessionSnapshotCacheKey = (snapshotKey: string, lang: Lang) =>
  `${toStaticSnapshotKey(snapshotKey)}|${lang}`

const canUseSessionStorage = () =>
  typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'

const buildSessionSnapshotStorageKey = (snapshotKey: string, lang: Lang) =>
  `${SESSION_SNAPSHOT_STORAGE_PREFIX}${buildSessionSnapshotCacheKey(snapshotKey, lang)}`

const buildRouteResourceKey = (snapshotKey: string) =>
  `route:${toStaticSnapshotKey(snapshotKey)}`

const readStoredSessionSnapshot = (
  snapshotKey: string,
  lang: Lang
): StaticShellSnapshot | null => {
  if (!canUseSessionStorage()) {
    return null
  }

  try {
    const raw = window.sessionStorage.getItem(
      buildSessionSnapshotStorageKey(snapshotKey, lang)
    )
    if (!raw) {
      return null
    }
    return JSON.parse(raw) as StaticShellSnapshot
  } catch {
    return null
  }
}

const writeStoredSessionSnapshot = (snapshot: StaticShellSnapshot) => {
  if (!canUseSessionStorage()) {
    return
  }

  try {
    window.sessionStorage.setItem(
      buildSessionSnapshotStorageKey(snapshot.path, snapshot.lang),
      JSON.stringify(snapshot)
    )
  } catch {
    // Ignore best-effort session snapshot persistence failures.
  }
}

const clearStoredSessionSnapshots = (options?: {
  snapshotKey?: string
  lang?: Lang | null
}) => {
  if (!canUseSessionStorage()) {
    return
  }

  try {
    if (!options?.snapshotKey) {
      const keysToDelete: string[] = []
      for (let index = 0; index < window.sessionStorage.length; index += 1) {
        const key = window.sessionStorage.key(index)
        if (key?.startsWith(SESSION_SNAPSHOT_STORAGE_PREFIX)) {
          keysToDelete.push(key)
        }
      }
      keysToDelete.forEach((key) => window.sessionStorage.removeItem(key))
      return
    }

    const normalizedSnapshotKey = toStaticSnapshotKey(options.snapshotKey)
    const keyPrefix = `${SESSION_SNAPSHOT_STORAGE_PREFIX}${normalizedSnapshotKey}|`
    const keysToDelete: string[] = []
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index)
      if (!key?.startsWith(keyPrefix)) {
        continue
      }
      if (options.lang) {
        const expectedKey = buildSessionSnapshotStorageKey(
          normalizedSnapshotKey,
          options.lang
        )
        if (key !== expectedKey) {
          continue
        }
      }
      keysToDelete.push(key)
    }
    keysToDelete.forEach((key) => window.sessionStorage.removeItem(key))
  } catch {
    // Ignore best-effort session snapshot cleanup failures.
  }
}

const resolveSnapshotRouteBase = () => {
  if (typeof window === 'undefined') {
    return 'http://localhost/'
  }
  if (typeof window.location?.href === 'string') {
    return window.location.href
  }
  if (typeof window.location?.origin === 'string') {
    return `${window.location.origin}/`
  }
  return 'http://localhost/'
}

const serializeDocumentType = (doc: Document) => {
  const doctype = doc.doctype
  if (!doctype?.name) {
    return '<!DOCTYPE html>'
  }

  let serialized = `<!DOCTYPE ${doctype.name}`
  if (doctype.publicId) {
    serialized += ` PUBLIC "${doctype.publicId}"`
  } else if (doctype.systemId) {
    serialized += ' SYSTEM'
  }
  if (doctype.systemId) {
    serialized += ` "${doctype.systemId}"`
  }
  return `${serialized}>`
}

const sanitizeStaticShellSnapshotHtml = (html: string) =>
  html
    .replace(HYDRATED_WIDGET_ATTR_RE, ' data-fragment-widget-hydrated="false"')
    .replace(RESIDENT_STATE_ATTR_RE, '')

const extractHeadHtml = (html: string) => {
  const match = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)
  return match?.[1] ?? ''
}

const parseElementAttributes = (html: string) => {
  const openTagMatch = html.match(/^<([a-zA-Z][\w:-]*)([\s\S]*?)>/i)
  if (!openTagMatch?.[2]) {
    return {}
  }

  const attributeSource = openTagMatch[2]
  const attributePattern = /([^\s=/>]+)(?:=(["'])([\s\S]*?)\2)?/g
  const attributes: Record<string, string> = {}
  let attributeMatch: RegExpExecArray | null = null

  for (;;) {
    attributeMatch = attributePattern.exec(attributeSource)
    if (!attributeMatch?.[1]) {
      break
    }
    const attributeName = attributeMatch[1]
    if (attributeName === '/' || attributeName === openTagMatch[1]) {
      continue
    }
    attributes[attributeName] = attributeMatch[3] ?? ''
  }

  return attributes
}

const collectManagedHeadElementStrings = (headHtml: string) => {
  const patterns = [
    /<meta\b[^>]*name=(["'])prom-home-deferred-global-style\1[^>]*>/gi,
    /<link\b(?=[^>]*rel=(["'])stylesheet\1)(?=[^>]*href=(["'])[^"']*global-deferred\.css[^"']*\2)[^>]*>/gi,
    /<link\b(?=[^>]*rel=(["'])stylesheet\1)(?=[^>]*data-home-deferred-global-style-href=(["'])[\s\S]*?\2)[^>]*>/gi,
    /<link\b(?=[^>]*rel=(["'])stylesheet\1)(?=[^>]*data-fragment-css=(["'])[\s\S]*?\2)[^>]*>/gi,
    /<style\b[^>]*data-src=(["'])[\s\S]*?\1[^>]*>[\s\S]*?<\/style>/gi,
  ]

  return patterns
    .flatMap((pattern) =>
      Array.from(headHtml.matchAll(pattern)).map((match) => ({
        index: match.index ?? 0,
        html: match[0],
      }))
    )
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.html)
}

const readManagedHeadElementsFromHtml = (html: string) =>
  collectManagedHeadElementStrings(extractHeadHtml(html)).map((entry) =>
    sanitizeStaticShellSnapshotHtml(entry)
  )

const readManagedHeadElementsFromDocument = (doc: Document | null) => {
  if (!doc?.head || typeof doc.head.querySelectorAll !== 'function') {
    return []
  }

  return Array.from(doc.head.querySelectorAll(MANAGED_HEAD_SELECTOR))
    .map((element) =>
      typeof (element as HTMLElement).outerHTML === 'string'
        ? sanitizeStaticShellSnapshotHtml((element as HTMLElement).outerHTML)
        : null
    )
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
}

const readLayoutShellAttributesFromHtml = (html: string, snapshotKey: string) => {
  const routeConfig = getStaticShellRouteConfig(snapshotKey)
  if (!routeConfig) {
    return {}
  }

  const layoutShellHtml = extractElementByAttribute(
    html,
    STATIC_ROUTE_ATTR,
    routeConfig.routeKind
  )
  if (!layoutShellHtml) {
    return {}
  }

  return parseElementAttributes(layoutShellHtml)
}

const readLayoutShellAttributesFromDocument = (doc: Document | null) => {
  const layoutShell = doc?.querySelector?.(LAYOUT_SHELL_SELECTOR)
  if (!(layoutShell instanceof HTMLElement)) {
    return {}
  }

  return Array.from(layoutShell.attributes).reduce<Record<string, string>>(
    (attributes, attribute) => {
      attributes[attribute.name] = attribute.value
      return attributes
    },
    {}
  )
}

const buildCurrentStaticShellDocumentHtml = (doc: Document | null) => {
  if (!doc) {
    return null
  }

  const root = doc?.documentElement
  if (!root?.outerHTML) {
    return null
  }

  return sanitizeStaticShellSnapshotHtml(
    `${serializeDocumentType(doc)}\n${root.outerHTML}`
  )
}

const postStaticShellDocumentToServiceWorker = ({
  snapshotKey,
  lang,
  doc,
}: {
  snapshotKey: string
  lang: Lang
  doc: Document | null
}) => {
  const html = buildCurrentStaticShellDocumentHtml(doc)
  if (!html || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return
  }

  const href = doc?.location?.href ?? (typeof window !== 'undefined' ? window.location?.href : null)
  if (!href) {
    return
  }

  let routeUrl: string
  try {
    const nextUrl = new URL(href, resolveSnapshotRouteBase())
    nextUrl.hash = ''
    routeUrl = nextUrl.toString()
  } catch {
    return
  }

  const normalizedSnapshotKey = toStaticSnapshotKey(snapshotKey)
  const scopeKey = resolveFragmentCacheScope(
    normalizedSnapshotKey,
    resolveCurrentFragmentUserCacheKey()
  )
  const userCacheKey = parseUserFragmentCacheScope(scopeKey)
  const message = {
    type: 'sw:update-resource',
    resourceKey: buildRouteResourceKey(normalizedSnapshotKey),
    url: routeUrl,
    userCacheKey,
    body: html,
    contentType: 'text/html; charset=utf-8',
  }

  const send = (worker: Pick<ServiceWorker, 'postMessage'> | null | undefined) => {
    if (!worker) {
      return false
    }
    worker.postMessage(message)
    return true
  }

  if (send(navigator.serviceWorker.controller)) {
    return
  }

  const getRegistration = navigator.serviceWorker.getRegistration?.bind(navigator.serviceWorker)
  if (!getRegistration) {
    return
  }

  void getRegistration().then((registration) => {
    send(registration?.active)
  }).catch(() => {
    // Ignore best-effort service worker sync failures.
  })
}

const loadStaticShellSnapshotFromRoute = async (snapshotKey: string, lang: Lang) => {
  const normalizedSnapshotKey = toStaticSnapshotKey(snapshotKey)
  const routeUrl = new URL(normalizedSnapshotKey, resolveSnapshotRouteBase())
  routeUrl.searchParams.set('lang', lang)
  const html = await readText(routeUrl)
  const header = extractElementByAttribute(html, STATIC_SHELL_REGION_ATTR, STATIC_SHELL_HEADER_REGION)
  const main = extractElementByAttribute(html, STATIC_SHELL_REGION_ATTR, STATIC_SHELL_MAIN_REGION)
  const dock = extractElementByAttribute(html, STATIC_SHELL_REGION_ATTR, STATIC_SHELL_DOCK_REGION)

  if (!header || !main || !dock) {
    throw new Error(`Snapshot HTML extraction failed for ${normalizedSnapshotKey} (${lang})`)
  }

  return {
    path: normalizedSnapshotKey,
    lang,
    title: extractHtmlTitle(html),
    head: {
      managed: readManagedHeadElementsFromHtml(html)
    },
    shell: {
      layoutAttributes: readLayoutShellAttributesFromHtml(html, normalizedSnapshotKey)
    },
    regions: {
      header,
      main,
      dock
    }
  } satisfies StaticShellSnapshot
}

const parseHtmlFragment = (html: string) => {
  const template = document.createElement('template')
  setTrustedTemplateHtml(template, html, 'server')
  const next = template.content.firstElementChild
  return next instanceof HTMLElement ? next : null
}

const replaceManagedHeadElements = (managedHead: string[]) => {
  if (typeof document === 'undefined' || !document.head) {
    return
  }

  Array.from(document.head.querySelectorAll(MANAGED_HEAD_SELECTOR)).forEach((element) => {
    element.parentNode?.removeChild(element)
  })

  managedHead.forEach((html) => {
    const element = parseHtmlFragment(html)
    if (!element) {
      return
    }
    document.head.appendChild(element)
  })
}

const syncLayoutShellAttributes = (layoutAttributes: Record<string, string> | null | undefined) => {
  if (typeof document === 'undefined' || typeof document.querySelector !== 'function') {
    return
  }

  const layoutShell = document.querySelector<HTMLElement>(LAYOUT_SHELL_SELECTOR)
  if (!layoutShell) {
    return
  }

  const nextAttributes = layoutAttributes ?? {}
  Array.from(layoutShell.attributes).forEach((attribute) => {
    if (attribute.name in nextAttributes) {
      return
    }
    layoutShell.removeAttribute(attribute.name)
  })

  Object.entries(nextAttributes).forEach(([name, value]) => {
    layoutShell.setAttribute(name, value)
  })
}

const replaceStaticShellRegionHtml = (region: string, html: string) => {
  const current = document.querySelector<HTMLElement>(`[${STATIC_SHELL_REGION_ATTR}="${region}"]`)
  const next = parseHtmlFragment(html)
  if (!current || !next) return
  current.replaceWith(next)
}

const replaceStaticShellDockRegion = (dockHtml: string, dockState?: StaticDockState) => {
  if (!dockState) {
    replaceStaticShellRegionHtml(STATIC_SHELL_DOCK_REGION, dockHtml)
    return
  }

  const current = document.querySelector<HTMLElement>(`[${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_DOCK_REGION}"]`)
  if (!current) {
    replaceStaticShellRegionHtml(STATIC_SHELL_DOCK_REGION, renderDockRegionHtml(dockState))
    return
  }

  syncStaticDockMarkup({
    root: current,
    lang: dockState.lang,
    currentPath: dockState.currentPath,
    isAuthenticated: dockState.isAuthenticated,
    force: true,
    lockMetrics: true
  })
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

const resolveSnapshotAssetPath = async (snapshotKey: string, lang: Lang) => {
  const normalizedSnapshotKey = toStaticSnapshotKey(snapshotKey)
  try {
    const manifest = await loadStaticShellSnapshotManifest()
    const assetPath = manifest[normalizedSnapshotKey]?.[lang]
    if (assetPath) {
      return assetPath
    }
  } catch {
    // Fall back to the deterministic asset path when the manifest is unavailable.
  }

  return toStaticSnapshotAssetPath(normalizedSnapshotKey, lang)
}

export const loadStaticShellSnapshot = async (snapshotKey: string, lang: Lang) => {
  const normalizedSnapshotKey = toStaticSnapshotKey(snapshotKey)
  const sessionSnapshot = liveSessionSnapshotCache.get(buildSessionSnapshotCacheKey(normalizedSnapshotKey, lang))
  if (sessionSnapshot) {
    return sessionSnapshot
  }
  const storedSessionSnapshot = readStoredSessionSnapshot(normalizedSnapshotKey, lang)
  if (storedSessionSnapshot) {
    liveSessionSnapshotCache.set(
      buildSessionSnapshotCacheKey(normalizedSnapshotKey, lang),
      storedSessionSnapshot
    )
    return storedSessionSnapshot
  }
  const cacheKey = `${normalizedSnapshotKey}|${lang}`
  const cached = snapshotCache.get(cacheKey)
  if (cached) {
    return await cached
  }

  const nextPromise = (async () => {
    try {
      return await loadStaticShellSnapshotFromRoute(normalizedSnapshotKey, lang)
    } catch {
      const assetPath = await resolveSnapshotAssetPath(normalizedSnapshotKey, lang)
      return await readJson<StaticShellSnapshot>(toSnapshotUrl(assetPath))
    }
  })()
  snapshotCache.set(cacheKey, nextPromise)
  return await nextPromise
}

export const applyStaticShellSnapshot = (
  snapshot: StaticShellSnapshot,
  options: {
    dockState?: StaticDockState
  } = {}
) => {
  parkResidentSubtreesWithin(typeof document !== 'undefined' ? document : null)
  replaceManagedHeadElements(snapshot.head?.managed ?? [])
  syncLayoutShellAttributes(snapshot.shell?.layoutAttributes)
  replaceStaticShellRegionHtml(STATIC_SHELL_HEADER_REGION, snapshot.regions.header)
  replaceStaticShellRegionHtml(STATIC_SHELL_MAIN_REGION, snapshot.regions.main)
  replaceStaticShellDockRegion(snapshot.regions.dock, options.dockState)
  restoreResidentSubtreesWithin(typeof document !== 'undefined' ? document : null)
  document.title = snapshot.title
  replayStaticSnapshotReadyStagger()
}

export const captureCurrentStaticShellSnapshot = (
  snapshotKey: string,
  lang: Lang,
  doc: Document | null = typeof document !== 'undefined' ? document : null
) => {
  if (!doc) {
    return null
  }

  const header = doc.querySelector<HTMLElement>(`[${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_HEADER_REGION}"]`)
  const main = doc.querySelector<HTMLElement>(`[${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_MAIN_REGION}"]`)
  const dock = doc.querySelector<HTMLElement>(`[${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_DOCK_REGION}"]`)
  if (!header || !main || !dock) {
    return null
  }

  const snapshot: StaticShellSnapshot = {
    path: toStaticSnapshotKey(snapshotKey),
    lang,
    title: doc.title,
    head: {
      managed: readManagedHeadElementsFromDocument(doc)
    },
    shell: {
      layoutAttributes: readLayoutShellAttributesFromDocument(doc)
    },
    regions: {
      header: sanitizeStaticShellSnapshotHtml(header.outerHTML),
      main: sanitizeStaticShellSnapshotHtml(main.outerHTML),
      dock: sanitizeStaticShellSnapshotHtml(dock.outerHTML)
    }
  }
  liveSessionSnapshotCache.set(buildSessionSnapshotCacheKey(snapshotKey, lang), snapshot)
  writeStoredSessionSnapshot(snapshot)
  postStaticShellDocumentToServiceWorker({
    snapshotKey: snapshot.path,
    lang: snapshot.lang,
    doc,
  })
  return snapshot
}

export const clearStaticShellSessionSnapshots = (options?: {
  snapshotKey?: string
  lang?: Lang | null
}) => {
  if (!options?.snapshotKey) {
    liveSessionSnapshotCache.clear()
    clearStoredSessionSnapshots()
    return
  }

  const normalizedSnapshotKey = toStaticSnapshotKey(options.snapshotKey)
  Array.from(liveSessionSnapshotCache.keys()).forEach((key) => {
    const [cachedSnapshotKey, cachedLang] = key.split('|')
    if (cachedSnapshotKey !== normalizedSnapshotKey) {
      return
    }
    if (options.lang && cachedLang !== options.lang) {
      return
    }
    liveSessionSnapshotCache.delete(key)
  })
  clearStoredSessionSnapshots(options)
}

export const updateStaticShellUrlLang = (lang: Lang) => {
  const url = new URL(window.location.href)
  url.searchParams.set('lang', lang)
  const nextUrl = `${url.pathname}${url.search}${url.hash}`
  const state = window.history.state && typeof window.history.state === 'object' ? { ...window.history.state } : {}
  window.history.replaceState(state, '', nextUrl)
}

export const resetStaticShellSnapshotClientForTests = () => {
  snapshotManifestPromise = null
  snapshotCache.clear()
  liveSessionSnapshotCache.clear()
}
