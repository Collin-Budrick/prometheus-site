import type { HomeDemoActivationResult, HomeDemoKind } from './home-demo-activate'
import { resolveStaticAssetUrl } from './static-asset-url'

const HOME_DEMO_RUNTIME_ASSET_PATH = 'build/static-shell/apps/site/src/static-shell/home-demo-runtime.js'
const HOME_DEMO_STYLESHEET_SELECTOR = 'link[data-home-demo-stylesheet]'

export type ActivateHomeDemoOptions = {
  root: Element
  kind: HomeDemoKind
  props: Record<string, unknown>
}

export type HomeDemoRuntimeModule = {
  activateHomeDemo: (options: ActivateHomeDemoOptions) => Promise<HomeDemoActivationResult>
}

type LoadHomeDemoRuntimeOptions = {
  assetUrl?: string
  stylesheetHref?: string
  importer?: (url: string) => Promise<HomeDemoRuntimeModule>
}

let homeDemoRuntimePromise: Promise<HomeDemoRuntimeModule> | null = null
let homeDemoStylesheetPromise: Promise<void> | null = null

const importHomeDemoRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomeDemoRuntimeModule

type HomeDemoStylesheetDocument = Pick<Document, 'createElement' | 'head' | 'querySelector'>

type EnsureHomeDemoStylesheetOptions = {
  doc?: HomeDemoStylesheetDocument | null
  href?: string
}

const whenHomeDemoStylesheetReady = (link: HTMLLinkElement) =>
  new Promise<void>((resolve) => {
    if (link.rel === 'stylesheet' || link.sheet) {
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
    link.setAttribute('rel', 'stylesheet')
    link.removeAttribute('as')
  })

export const ensureHomeDemoStylesheet = ({
  doc = typeof document !== 'undefined' ? document : null,
  href
}: EnsureHomeDemoStylesheetOptions = {}) => {
  if (homeDemoStylesheetPromise) {
    return homeDemoStylesheetPromise
  }

  if (!doc) {
    homeDemoStylesheetPromise = Promise.resolve()
    return homeDemoStylesheetPromise
  }

  const existingLink = doc.querySelector(HOME_DEMO_STYLESHEET_SELECTOR) as HTMLLinkElement | null
  if (existingLink) {
    homeDemoStylesheetPromise = whenHomeDemoStylesheetReady(existingLink)
    return homeDemoStylesheetPromise
  }

  if (!href) {
    homeDemoStylesheetPromise = Promise.resolve()
    return homeDemoStylesheetPromise
  }

  const link = doc.createElement('link')
  link.setAttribute('rel', 'stylesheet')
  link.setAttribute('href', href)
  link.setAttribute('data-home-demo-stylesheet', 'true')
  doc.head.appendChild(link)
  homeDemoStylesheetPromise = whenHomeDemoStylesheetReady(link)
  return homeDemoStylesheetPromise
}

export const resolveHomeDemoRuntimeUrl = (options?: Parameters<typeof resolveStaticAssetUrl>[1]) =>
  resolveStaticAssetUrl(HOME_DEMO_RUNTIME_ASSET_PATH, options)

export const loadHomeDemoRuntime = ({
  assetUrl = resolveHomeDemoRuntimeUrl(),
  stylesheetHref,
  importer = importHomeDemoRuntime
}: LoadHomeDemoRuntimeOptions = {}) => {
  if (!homeDemoRuntimePromise) {
    homeDemoRuntimePromise = ensureHomeDemoStylesheet({ href: stylesheetHref }).then(() => importer(assetUrl))
  }
  return homeDemoRuntimePromise
}

export const resetHomeDemoRuntimeLoaderForTests = () => {
  homeDemoRuntimePromise = null
  homeDemoStylesheetPromise = null
}
