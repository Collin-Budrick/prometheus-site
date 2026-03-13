import { resolveStaticAssetUrl } from './static-asset-url'

const HOME_DEMO_ENTRY_ASSET_PATH = 'build/static-shell/apps/site/src/static-shell/home-demo-entry.js'

export type HomeDemoEntryModule = {
  installHomeDemoEntry: () => () => void
}

type LoadHomeDemoEntryRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomeDemoEntryModule>
}

let homeDemoEntryRuntimePromise: Promise<HomeDemoEntryModule> | null = null

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

export const resetHomeDemoEntryRuntimeLoaderForTests = () => {
  homeDemoEntryRuntimePromise = null
}
