import type {
  HomeDemoAssetDescriptor,
  HomeDemoRuntimeModule,
  HomeDemoStartupAttachRuntimeModule
} from './home-demo-runtime-types'
import {
  HOME_DEMO_RUNTIME_ASSET_PATHS,
  HOME_DEMO_STARTUP_ATTACH_RUNTIME_ASSET_PATH
} from './home-demo-runtime-types'
import type { HomeDemoKind } from './home-demo-activate'
import { markHomeDemoPerformance } from './home-demo-performance'
import { resolveStaticAssetUrl } from '../core/static-asset-url'

export type { HomeDemoRuntimeModule } from './home-demo-runtime-types'
export type { HomeDemoStartupAttachRuntimeModule } from './home-demo-runtime-types'

type HomeDemoStylesheetBaseDocument = {
  baseURI?: string
}

type HomeDemoStylesheetDocument = Pick<
  Document,
  'createElement' | 'head' | 'querySelector' | 'scripts'
> &
  Partial<HomeDemoStylesheetBaseDocument>

type HomeDemoStylesheetSearchDocument = Pick<
  Document,
  'baseURI' | 'querySelectorAll' | 'scripts'
>

type LoadHomeDemoKindOptions = {
  asset?: HomeDemoAssetDescriptor | null
  importer?: (url: string) => Promise<HomeDemoRuntimeModule>
}

type LoadHomeDemoStartupAttachRuntimeOptions = {
  importer?: (url: string) => Promise<HomeDemoStartupAttachRuntimeModule>
}

type WarmHomeDemoKindOptions = {
  doc?: HomeDemoStylesheetDocument | null
}

type EnsureHomeDemoKindStyleOptions = {
  kind: HomeDemoKind
  asset?: HomeDemoAssetDescriptor | null
  doc?: HomeDemoStylesheetDocument | null
}

const modulePromises = new Map<HomeDemoKind, Promise<HomeDemoRuntimeModule>>()
const warmPromises = new Map<HomeDemoKind, Promise<void>>()
const preloadPromises = new Map<HomeDemoKind, Promise<void>>()
let startupAttachRuntimePromise: Promise<HomeDemoStartupAttachRuntimeModule> | null = null
let startupAttachPreloadPromise: Promise<void> | null = null
const HOME_DEMO_STYLE_PROMISES_KEY = '__PROM_HOME_DEMO_STYLE_PROMISES__'

const importRuntimeModule = async <T>(url: string) =>
  (await import(/* @vite-ignore */ url)) as T

const isAbsoluteUrl = (value: string) => /^https?:\/\//.test(value)
const isRootRelativeUrl = (value: string) => value.startsWith('/')

const resolveModuleUrl = (kind: HomeDemoKind, asset?: HomeDemoAssetDescriptor | null) => {
  const href = asset?.moduleHref || HOME_DEMO_RUNTIME_ASSET_PATHS[kind]
  if (isAbsoluteUrl(href) || isRootRelativeUrl(href)) {
    return href
  }
  return resolveStaticAssetUrl(href)
}

const resolveStyleUrl = (
  href: string,
  doc: Pick<Document, 'scripts'> | null = typeof document !== 'undefined' ? document : null
) => {
  if (isAbsoluteUrl(href) || isRootRelativeUrl(href)) {
    return href
  }
  return resolveStaticAssetUrl(href, {
    scripts: doc?.scripts
  })
}

const escapeCssAttributeValue = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const getKindStyleHrefSelector = (href: string) => {
  const escapedHref = escapeCssAttributeValue(href)
  return `link[data-home-demo-style-href="${escapedHref}"],link[rel="stylesheet"][href="${escapedHref}"],link[rel="preload"][as="style"][href="${escapedHref}"]`
}

const getKindModulePreloadSelector = (kind: HomeDemoKind) =>
  `link[data-home-demo-module-kind="${kind}"]`
const STARTUP_ATTACH_RUNTIME_PRELOAD_SELECTOR = 'link[data-home-demo-startup-attach]'

const getGlobalHomeDemoStylePromises = () => {
  const globalState = globalThis as typeof globalThis & {
    __PROM_HOME_DEMO_STYLE_PROMISES__?: Map<string, Promise<void>>
  }
  if (!globalState[HOME_DEMO_STYLE_PROMISES_KEY]) {
    globalState[HOME_DEMO_STYLE_PROMISES_KEY] = new Map<string, Promise<void>>()
  }
  return globalState[HOME_DEMO_STYLE_PROMISES_KEY]
}

const getDocumentBaseHref = (
  doc: HomeDemoStylesheetBaseDocument | null = typeof document !== 'undefined' ? document : null
) => {
  if (doc && typeof doc.baseURI === 'string' && doc.baseURI.length > 0) {
    return doc.baseURI
  }
  if (typeof window !== 'undefined' && typeof window.location?.href === 'string') {
    return window.location.href
  }
  return 'http://localhost/'
}

const canonicalizeDocumentHref = (
  href: string,
  doc: HomeDemoStylesheetBaseDocument | null = typeof document !== 'undefined' ? document : null
) => {
  try {
    return new URL(href, getDocumentBaseHref(doc)).toString()
  } catch {
    return href
  }
}

const isStylesheetLinkCandidate = (link: Element) => {
  const rel = link.getAttribute('rel')?.toLowerCase() ?? ''
  const as = link.getAttribute('as')?.toLowerCase() ?? ''
  return (
    rel === 'stylesheet' ||
    (rel === 'preload' && as === 'style') ||
    typeof link.getAttribute('data-home-demo-style-href') === 'string'
  )
}

const findExistingKindStyleLink = (
  href: string,
  doc: (HomeDemoStylesheetDocument & Partial<HomeDemoStylesheetSearchDocument>) | null
) => {
  if (!doc) {
    return null
  }

  const searchDoc = doc as HomeDemoStylesheetSearchDocument
  if (typeof searchDoc.querySelectorAll === 'function') {
    const canonicalHref = canonicalizeDocumentHref(href, searchDoc)
    const links = Array.from(
      searchDoc.querySelectorAll('link[href],link[data-home-demo-style-href]')
    ) as HTMLLinkElement[]

    return (
      links.find((link) => {
        if (!isStylesheetLinkCandidate(link)) {
          return false
        }

        const candidates = [
          link.getAttribute('data-home-demo-style-href'),
          link.getAttribute('href'),
          typeof link.href === 'string' && link.href.length > 0 ? link.href : null
        ].filter((value): value is string => typeof value === 'string' && value.length > 0)

        return candidates.some(
          (candidate) => canonicalizeDocumentHref(candidate, searchDoc) === canonicalHref
        )
      }) ?? null
    )
  }

  return doc.querySelector(getKindStyleHrefSelector(href)) as HTMLLinkElement | null
}

const whenStylesheetReady = (link: HTMLLinkElement) =>
  new Promise<void>((resolve) => {
    if (link.rel === 'stylesheet' && link.sheet) {
      resolve()
      return
    }

    const handleReady = () => {
      link.removeEventListener('load', handleReady)
      link.removeEventListener('error', handleReady)
      resolve()
    }

    link.addEventListener('load', handleReady, { once: true })
    link.addEventListener('error', handleReady, { once: true })
    if (link.rel !== 'stylesheet') {
      link.setAttribute('rel', 'stylesheet')
      link.removeAttribute('as')
    }
  })

const ensureModulePreloadLink = (
  kind: HomeDemoKind,
  href: string,
  doc: HomeDemoStylesheetDocument | null = typeof document !== 'undefined' ? document : null
) => {
  const existingPromise = preloadPromises.get(kind)
  if (existingPromise) {
    return existingPromise
  }

  if (!doc) {
    const resolvedPromise = Promise.resolve()
    preloadPromises.set(kind, resolvedPromise)
    return resolvedPromise
  }

  const existingLink = doc.querySelector(getKindModulePreloadSelector(kind)) as HTMLLinkElement | null
  if (existingLink) {
    const promise = new Promise<void>((resolve) => {
      if (existingLink.rel === 'modulepreload') {
        resolve()
        return
      }

      const handleReady = () => {
        existingLink.removeEventListener('load', handleReady)
        existingLink.removeEventListener('error', handleReady)
        resolve()
      }

      existingLink.addEventListener('load', handleReady, { once: true })
      existingLink.addEventListener('error', handleReady, { once: true })
    })
    preloadPromises.set(kind, promise)
    return promise
  }

  const link = doc.createElement('link')
  link.setAttribute('rel', 'modulepreload')
  link.setAttribute('href', href)
  link.setAttribute('data-home-demo-module-kind', kind)
  doc.head.appendChild(link)

  const promise = new Promise<void>((resolve) => {
    const handleReady = () => {
      link.removeEventListener('load', handleReady)
      link.removeEventListener('error', handleReady)
      resolve()
    }

    link.addEventListener('load', handleReady, { once: true })
    link.addEventListener('error', handleReady, { once: true })
    if (typeof window === 'undefined') {
      resolve()
    }
  })
  preloadPromises.set(kind, promise)
  return promise
}

export const ensureHomeDemoKindStyle = ({
  kind,
  asset,
  doc = typeof document !== 'undefined' ? document : null
}: EnsureHomeDemoKindStyleOptions) => {
  const styleHref = asset?.styleHref ?? null
  if (!styleHref) {
    return Promise.resolve()
  }

  const href = resolveStyleUrl(styleHref, doc)
  const styleKey = canonicalizeDocumentHref(href, doc)
  const stylePromises = getGlobalHomeDemoStylePromises()

  const existingPromise = stylePromises.get(styleKey)
  if (existingPromise) {
    return existingPromise
  }

  if (!doc) {
    const resolvedPromise = Promise.resolve()
    stylePromises.set(styleKey, resolvedPromise)
    return resolvedPromise
  }

  const existingLink = findExistingKindStyleLink(href, doc)
  if (existingLink) {
    const promise = whenStylesheetReady(existingLink)
    stylePromises.set(styleKey, promise)
    return promise
  }

  const link = doc.createElement('link')
  link.setAttribute('rel', 'preload')
  link.setAttribute('as', 'style')
  link.setAttribute('href', href)
  link.setAttribute('data-home-demo-style-kind', kind)
  link.setAttribute('data-home-demo-style-href', styleKey)
  doc.head.appendChild(link)

  const promise = whenStylesheetReady(link).catch((error) => {
    console.warn(`Home demo stylesheet failed to load for ${kind}:`, error)
  })
  stylePromises.set(styleKey, promise)
  return promise
}

export const resolveHomeDemoRuntimeUrl = (
  kind: HomeDemoKind,
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => {
  const href = HOME_DEMO_RUNTIME_ASSET_PATHS[kind]
  return resolveStaticAssetUrl(href, options)
}

export const resolveHomeDemoStartupAttachRuntimeUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_DEMO_STARTUP_ATTACH_RUNTIME_ASSET_PATH, options)

export const loadHomeDemoKind = (
  kind: HomeDemoKind,
  {
    asset,
    importer = (url) => importRuntimeModule<HomeDemoRuntimeModule>(url)
  }: LoadHomeDemoKindOptions = {}
) => {
  const existingPromise = modulePromises.get(kind)
  if (existingPromise) {
    return existingPromise
  }

  const promise = importer(resolveModuleUrl(kind, asset))
  modulePromises.set(kind, promise)
  return promise
}

export const loadHomeDemoStartupAttachRuntime = ({
  importer = (url) => importRuntimeModule<HomeDemoStartupAttachRuntimeModule>(url)
}: LoadHomeDemoStartupAttachRuntimeOptions = {}) => {
  if (startupAttachRuntimePromise) {
    return startupAttachRuntimePromise
  }

  startupAttachRuntimePromise = importer(resolveHomeDemoStartupAttachRuntimeUrl())
  return startupAttachRuntimePromise
}

export const warmHomeDemoKind = (
  kind: HomeDemoKind,
  asset?: HomeDemoAssetDescriptor | null,
  {
    doc = typeof document !== 'undefined' ? document : null
  }: WarmHomeDemoKindOptions = {}
) => {
  const existingPromise = warmPromises.get(kind)
  if (existingPromise) {
    return existingPromise
  }

  markHomeDemoPerformance(`prom:home-demo:warm-start:${kind}`, { detailed: true })
  const moduleHref = resolveModuleUrl(kind, asset)

  const promise = Promise.all([
    ensureHomeDemoKindStyle({ kind, asset, doc }),
    ensureModulePreloadLink(kind, moduleHref, doc)
  ]).then(() => {
    markHomeDemoPerformance(`prom:home-demo:warm-ready:${kind}`, { detailed: true })
  })

  warmPromises.set(kind, promise)
  return promise
}

export const warmHomeDemoStartupAttachRuntime = ({
  doc = typeof document !== 'undefined' ? document : null
}: WarmHomeDemoKindOptions = {}) => {
  if (startupAttachPreloadPromise) {
    return startupAttachPreloadPromise
  }

  if (
    !doc ||
    typeof doc.querySelector !== 'function' ||
    typeof doc.createElement !== 'function' ||
    !('head' in doc) ||
    !doc.head
  ) {
    startupAttachPreloadPromise = Promise.resolve()
    return startupAttachPreloadPromise
  }

  const href = resolveHomeDemoStartupAttachRuntimeUrl()
  const existingLink = doc.querySelector(
    STARTUP_ATTACH_RUNTIME_PRELOAD_SELECTOR
  ) as HTMLLinkElement | null
  if (existingLink) {
    startupAttachPreloadPromise = new Promise<void>((resolve) => {
      if (existingLink.rel === 'modulepreload') {
        resolve()
        return
      }

      const handleReady = () => {
        existingLink.removeEventListener('load', handleReady)
        existingLink.removeEventListener('error', handleReady)
        resolve()
      }

      existingLink.addEventListener('load', handleReady, { once: true })
      existingLink.addEventListener('error', handleReady, { once: true })
    })
    return startupAttachPreloadPromise
  }

  const link = doc.createElement('link')
  link.setAttribute('rel', 'modulepreload')
  link.setAttribute('href', href)
  link.setAttribute('data-home-demo-startup-attach', 'true')
  doc.head.appendChild(link)

  startupAttachPreloadPromise = new Promise<void>((resolve) => {
    const handleReady = () => {
      link.removeEventListener('load', handleReady)
      link.removeEventListener('error', handleReady)
      resolve()
    }

    link.addEventListener('load', handleReady, { once: true })
    link.addEventListener('error', handleReady, { once: true })
    if (typeof window === 'undefined') {
      resolve()
    }
  })
  return startupAttachPreloadPromise
}

export const resetHomeDemoRuntimeLoaderForTests = () => {
  modulePromises.clear()
  getGlobalHomeDemoStylePromises().clear()
  warmPromises.clear()
  preloadPromises.clear()
  startupAttachRuntimePromise = null
  startupAttachPreloadPromise = null
}
