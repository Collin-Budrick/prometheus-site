import type {
  HomeDemoAssetDescriptor,
  HomeDemoRuntimeModule
} from './home-demo-runtime-types'
import {
  HOME_DEMO_RUNTIME_ASSET_PATHS
} from './home-demo-runtime-types'
import type { HomeDemoKind } from './home-demo-activate'
import { resolveStaticAssetUrl } from './static-asset-url'

export type { HomeDemoRuntimeModule } from './home-demo-runtime-types'

type HomeDemoStylesheetDocument = Pick<Document, 'createElement' | 'head' | 'querySelector'>

type LoadHomeDemoKindOptions = {
  asset?: HomeDemoAssetDescriptor | null
  importer?: (url: string) => Promise<HomeDemoRuntimeModule>
}

type WarmHomeDemoKindOptions = LoadHomeDemoKindOptions & {
  doc?: HomeDemoStylesheetDocument | null
}

type EnsureHomeDemoKindStyleOptions = {
  kind: HomeDemoKind
  asset?: HomeDemoAssetDescriptor | null
  doc?: HomeDemoStylesheetDocument | null
}

type EnsureHomeDemoStylesheetOptions = {
  doc?: HomeDemoStylesheetDocument | null
  href?: string
}

const HOME_DEMO_STYLESHEET_SELECTOR = 'link[data-home-demo-stylesheet]'

const modulePromises = new Map<HomeDemoKind, Promise<HomeDemoRuntimeModule>>()
const stylePromises = new Map<HomeDemoKind, Promise<void>>()
const warmPromises = new Map<HomeDemoKind, Promise<void>>()
let combinedHomeDemoStylesheetPromise: Promise<void> | null = null

const markPerformance = (name: string) => {
  if (typeof performance === 'undefined' || typeof performance.mark !== 'function') {
    return
  }
  performance.mark(name)
}

const importHomeDemoRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomeDemoRuntimeModule

const isAbsoluteUrl = (value: string) => /^https?:\/\//.test(value)

const resolveModuleUrl = (kind: HomeDemoKind, asset?: HomeDemoAssetDescriptor | null) => {
  const href = asset?.moduleHref || HOME_DEMO_RUNTIME_ASSET_PATHS[kind]
  if (isAbsoluteUrl(href) || href.startsWith('/')) {
    return href
  }
  return resolveStaticAssetUrl(href)
}

const getKindStyleSelector = (kind: HomeDemoKind) => `link[data-home-demo-style-kind="${kind}"]`
const getKindModulePreloadSelector = (kind: HomeDemoKind) =>
  `link[data-home-demo-module-kind="${kind}"]`

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
  if (!doc) return
  const existingLink = doc.querySelector(getKindModulePreloadSelector(kind)) as HTMLLinkElement | null
  if (existingLink) return

  const link = doc.createElement('link')
  link.setAttribute('rel', 'modulepreload')
  link.setAttribute('href', href)
  link.setAttribute('data-home-demo-module-kind', kind)
  doc.head.appendChild(link)
}

export const ensureHomeDemoKindStyle = ({
  kind,
  asset,
  doc = typeof document !== 'undefined' ? document : null
}: EnsureHomeDemoKindStyleOptions) => {
  const existingPromise = stylePromises.get(kind)
  if (existingPromise) {
    return existingPromise
  }

  const href = asset?.styleHref ?? null
  if (!doc || !href) {
    const resolvedPromise = Promise.resolve()
    stylePromises.set(kind, resolvedPromise)
    return resolvedPromise
  }

  const existingLink = doc.querySelector(getKindStyleSelector(kind)) as HTMLLinkElement | null
  if (existingLink) {
    const promise = whenStylesheetReady(existingLink)
    stylePromises.set(kind, promise)
    return promise
  }

  const link = doc.createElement('link')
  link.setAttribute('rel', 'preload')
  link.setAttribute('as', 'style')
  link.setAttribute('href', href)
  link.setAttribute('data-home-demo-style-kind', kind)
  doc.head.appendChild(link)

  const promise = whenStylesheetReady(link).catch((error) => {
    console.warn(`Home demo stylesheet failed to load for ${kind}:`, error)
  })
  stylePromises.set(kind, promise)
  return promise
}

export const resolveHomeDemoRuntimeUrl = (
  kind: HomeDemoKind,
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => {
  const href = HOME_DEMO_RUNTIME_ASSET_PATHS[kind]
  return resolveStaticAssetUrl(href, options)
}

export const loadHomeDemoKind = (
  kind: HomeDemoKind,
  {
    asset,
    importer = importHomeDemoRuntime
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

export const warmHomeDemoKind = (
  kind: HomeDemoKind,
  asset?: HomeDemoAssetDescriptor | null,
  {
    importer = importHomeDemoRuntime,
    doc = typeof document !== 'undefined' ? document : null
  }: WarmHomeDemoKindOptions = {}
) => {
  const existingPromise = warmPromises.get(kind)
  if (existingPromise) {
    return existingPromise
  }

  markPerformance(`prom:home-demo:warm-start:${kind}`)
  const moduleHref = resolveModuleUrl(kind, asset)
  ensureModulePreloadLink(kind, moduleHref, doc)

  const promise = Promise.all([
    ensureHomeDemoKindStyle({ kind, asset, doc }),
    loadHomeDemoKind(kind, { asset, importer })
  ]).then(() => {
    markPerformance(`prom:home-demo:warm-ready:${kind}`)
  })

  warmPromises.set(kind, promise)
  return promise
}

export const ensureHomeDemoStylesheet = ({
  doc = typeof document !== 'undefined' ? document : null,
  href
}: EnsureHomeDemoStylesheetOptions = {}) => {
  if (combinedHomeDemoStylesheetPromise) {
    return combinedHomeDemoStylesheetPromise
  }

  if (!doc || !href) {
    combinedHomeDemoStylesheetPromise = Promise.resolve()
    return combinedHomeDemoStylesheetPromise
  }

  const existingLink = doc.querySelector(HOME_DEMO_STYLESHEET_SELECTOR) as HTMLLinkElement | null
  if (existingLink) {
    combinedHomeDemoStylesheetPromise = whenStylesheetReady(existingLink)
    return combinedHomeDemoStylesheetPromise
  }

  const link = doc.createElement('link')
  link.setAttribute('rel', 'stylesheet')
  link.setAttribute('href', href)
  link.setAttribute('data-home-demo-stylesheet', 'true')
  doc.head.appendChild(link)
  combinedHomeDemoStylesheetPromise = whenStylesheetReady(link)
  return combinedHomeDemoStylesheetPromise
}

export const resetHomeDemoRuntimeLoaderForTests = () => {
  modulePromises.clear()
  stylePromises.clear()
  warmPromises.clear()
  combinedHomeDemoStylesheetPromise = null
}
