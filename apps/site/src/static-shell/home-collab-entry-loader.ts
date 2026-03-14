import { resolveStaticAssetUrl } from './static-asset-url'

const HOME_COLLAB_ENTRY_ASSET_PATH = 'build/static-shell/apps/site/src/static-shell/home-collab-entry.js'

export type HomeCollabEntryModule = {
  installHomeCollabEntry: (options?: { initialTarget?: EventTarget | null }) => () => void
}

type LoadHomeCollabEntryRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomeCollabEntryModule>
}

let homeCollabEntryRuntimePromise: Promise<HomeCollabEntryModule> | null = null

const importHomeCollabEntryRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomeCollabEntryModule

export const resolveHomeCollabEntryRuntimeUrl = (options?: Parameters<typeof resolveStaticAssetUrl>[1]) =>
  resolveStaticAssetUrl(HOME_COLLAB_ENTRY_ASSET_PATH, options)

export const loadHomeCollabEntryRuntime = ({
  assetUrl = resolveHomeCollabEntryRuntimeUrl(),
  importer = importHomeCollabEntryRuntime
}: LoadHomeCollabEntryRuntimeOptions = {}) => {
  if (!homeCollabEntryRuntimePromise) {
    homeCollabEntryRuntimePromise = importer(assetUrl)
  }
  return homeCollabEntryRuntimePromise
}

export const resetHomeCollabEntryRuntimeLoaderForTests = () => {
  homeCollabEntryRuntimePromise = null
}
