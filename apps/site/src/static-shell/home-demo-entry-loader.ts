import { resolveStaticAssetUrl } from './static-asset-url'
import { HOME_DEMO_ENTRY_ASSET_PATH } from './home-demo-runtime-types'

export type HomeDemoEntryModule = {
  installHomeDemoEntry: () => () => void
}

type LoadHomeDemoEntryRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomeDemoEntryModule>
}

type HomeDemoEntryDocument = Pick<Document, 'createElement' | 'head' | 'querySelector'>

type WarmHomeDemoEntryRuntimeOptions = {
  doc?: HomeDemoEntryDocument | null
}

let homeDemoEntryRuntimePromise: Promise<HomeDemoEntryModule> | null = null
let homeDemoEntryPreloadPromise: Promise<void> | null = null

const HOME_DEMO_ENTRY_PRELOAD_SELECTOR = 'link[data-home-demo-entry-preload]'

const importHomeDemoEntryRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomeDemoEntryModule

export const resolveHomeDemoEntryRuntimeUrl = (options?: Parameters<typeof resolveStaticAssetUrl>[1]) =>
  resolveStaticAssetUrl(HOME_DEMO_ENTRY_ASSET_PATH, options)

export const loadHomeDemoEntryRuntime = ({
  assetUrl = resolveHomeDemoEntryRuntimeUrl(),
  importer = importHomeDemoEntryRuntime
}: LoadHomeDemoEntryRuntimeOptions = {}) => {
  if (!homeDemoEntryRuntimePromise) {
    homeDemoEntryRuntimePromise = importer(assetUrl)
  }
  return homeDemoEntryRuntimePromise
}

export const warmHomeDemoEntryRuntime = ({
  doc = typeof document !== 'undefined' ? document : null
}: WarmHomeDemoEntryRuntimeOptions = {}) => {
  if (homeDemoEntryPreloadPromise) {
    return homeDemoEntryPreloadPromise
  }

  if (
    !doc ||
    typeof doc.querySelector !== 'function' ||
    typeof doc.createElement !== 'function' ||
    !('head' in doc) ||
    !doc.head
  ) {
    homeDemoEntryPreloadPromise = Promise.resolve()
    return homeDemoEntryPreloadPromise
  }

  const href = resolveHomeDemoEntryRuntimeUrl()
  const existingLink = doc.querySelector(HOME_DEMO_ENTRY_PRELOAD_SELECTOR) as HTMLLinkElement | null
  if (existingLink) {
    homeDemoEntryPreloadPromise = new Promise<void>((resolve) => {
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
    return homeDemoEntryPreloadPromise
  }

  const link = doc.createElement('link')
  link.setAttribute('rel', 'modulepreload')
  link.setAttribute('href', href)
  link.setAttribute('data-home-demo-entry-preload', 'true')
  doc.head.appendChild(link)

  homeDemoEntryPreloadPromise = new Promise<void>((resolve) => {
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
  return homeDemoEntryPreloadPromise
}

export const resetHomeDemoEntryRuntimeLoaderForTests = () => {
  homeDemoEntryRuntimePromise = null
  homeDemoEntryPreloadPromise = null
}
