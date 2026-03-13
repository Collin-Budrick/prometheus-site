import { resolveStaticAssetUrl } from './static-asset-url'

const STORE_STATIC_RUNTIME_ASSET_PATH = 'build/static-shell/apps/site/src/static-shell/store-static-runtime.js'

export type StoreStaticRuntimeModule = {
  bootstrapStaticStoreShell: () => Promise<void>
}

type LoadStoreStaticRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<StoreStaticRuntimeModule>
}

let storeStaticRuntimePromise: Promise<StoreStaticRuntimeModule> | null = null

const importStoreStaticRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as StoreStaticRuntimeModule

export const resolveStoreStaticRuntimeUrl = (options?: Parameters<typeof resolveStaticAssetUrl>[1]) =>
  resolveStaticAssetUrl(STORE_STATIC_RUNTIME_ASSET_PATH, options)

export const loadStoreStaticRuntime = ({
  assetUrl = resolveStoreStaticRuntimeUrl(),
  importer = importStoreStaticRuntime
}: LoadStoreStaticRuntimeOptions = {}) => {
  if (!storeStaticRuntimePromise) {
    storeStaticRuntimePromise = importer(assetUrl)
  }
  return storeStaticRuntimePromise
}

export const resetStoreStaticRuntimeLoaderForTests = () => {
  storeStaticRuntimePromise = null
}
