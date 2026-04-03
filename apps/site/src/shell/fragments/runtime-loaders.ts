import { resolveStaticAssetUrl } from '../core/static-asset-url'

const FRAGMENT_BOOTSTRAP_RUNTIME_ASSET_PATH =
  'build/static-shell/apps/site/src/shell/fragments/fragment-bootstrap-runtime.js'
const FRAGMENT_HEIGHT_PATCH_RUNTIME_ASSET_PATH =
  'build/static-shell/apps/site/src/shell/fragments/fragment-height-patch-runtime.js'

export type FragmentBootstrapRuntimeModule = {
  bootstrapStaticFragmentShell: () => Promise<void>
}

export type FragmentHeightPatchRuntimeModule = {
  settlePatchedFragmentCardHeight: typeof import('./fragment-height').settlePatchedFragmentCardHeight
}

type LoadFragmentBootstrapRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<FragmentBootstrapRuntimeModule>
}

type LoadFragmentHeightPatchRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<FragmentHeightPatchRuntimeModule>
}

let fragmentBootstrapRuntimePromise: Promise<FragmentBootstrapRuntimeModule> | null = null
let fragmentHeightPatchRuntimePromise: Promise<FragmentHeightPatchRuntimeModule> | null = null

const MAX_RUNTIME_IMPORT_ATTEMPTS = 4
const RUNTIME_IMPORT_RETRY_BASE_DELAY_MS = 250
const RUNTIME_IMPORT_RETRY_QUERY_PARAM = '__static_runtime_retry'

const importFragmentBootstrapRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as FragmentBootstrapRuntimeModule

const importFragmentHeightPatchRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as FragmentHeightPatchRuntimeModule

const waitForRetryDelay = (attempt: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, RUNTIME_IMPORT_RETRY_BASE_DELAY_MS * attempt)
  })

const resolveRetryImportBase = () =>
  typeof window !== 'undefined' && typeof window.location?.origin === 'string'
    ? window.location.origin
    : 'https://prometheus.prod'

const resolveRetryImportUrl = (assetUrl: string, attempt: number) => {
  if (attempt <= 1) {
    return assetUrl
  }

  try {
    const url = new URL(assetUrl, resolveRetryImportBase())
    url.searchParams.set(RUNTIME_IMPORT_RETRY_QUERY_PARAM, String(attempt))
    return url.toString()
  } catch {
    const separator = assetUrl.includes('?') ? '&' : '?'
    return `${assetUrl}${separator}${RUNTIME_IMPORT_RETRY_QUERY_PARAM}=${attempt}`
  }
}

const loadRuntimeWithRetries = async <TModule>({
  assetUrl,
  importer
}: {
  assetUrl: string
  importer: (url: string) => Promise<TModule>
}) => {
  let lastError: unknown = null

  for (let attempt = 1; attempt <= MAX_RUNTIME_IMPORT_ATTEMPTS; attempt += 1) {
    try {
      return await importer(resolveRetryImportUrl(assetUrl, attempt))
    } catch (error) {
      lastError = error
      if (attempt < MAX_RUNTIME_IMPORT_ATTEMPTS) {
        await waitForRetryDelay(attempt)
      }
    }
  }

  throw lastError
}

export const resolveFragmentBootstrapRuntimeUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(FRAGMENT_BOOTSTRAP_RUNTIME_ASSET_PATH, options)

export const resolveFragmentHeightPatchRuntimeUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(FRAGMENT_HEIGHT_PATCH_RUNTIME_ASSET_PATH, options)

export const loadFragmentBootstrapRuntime = ({
  assetUrl = resolveFragmentBootstrapRuntimeUrl(),
  importer = importFragmentBootstrapRuntime
}: LoadFragmentBootstrapRuntimeOptions = {}) => {
  if (!fragmentBootstrapRuntimePromise) {
    fragmentBootstrapRuntimePromise = loadRuntimeWithRetries({ assetUrl, importer }).catch((error) => {
      fragmentBootstrapRuntimePromise = null
      throw error
    })
  }
  return fragmentBootstrapRuntimePromise
}

export const loadFragmentHeightPatchRuntime = ({
  assetUrl = resolveFragmentHeightPatchRuntimeUrl(),
  importer = importFragmentHeightPatchRuntime
}: LoadFragmentHeightPatchRuntimeOptions = {}) => {
  if (!fragmentHeightPatchRuntimePromise) {
    fragmentHeightPatchRuntimePromise = loadRuntimeWithRetries({ assetUrl, importer }).catch((error) => {
      fragmentHeightPatchRuntimePromise = null
      throw error
    })
  }
  return fragmentHeightPatchRuntimePromise
}

export const resetFragmentRuntimeLoadersForTests = () => {
  fragmentBootstrapRuntimePromise = null
  fragmentHeightPatchRuntimePromise = null
}

export const resetFragmentBootstrapRuntimeLoaderForTests = resetFragmentRuntimeLoadersForTests
export const resetFragmentHeightPatchRuntimeLoaderForTests = resetFragmentRuntimeLoadersForTests
