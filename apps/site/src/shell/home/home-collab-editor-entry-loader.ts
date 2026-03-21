import { resolveStaticAssetUrl } from '../core/static-asset-url'

const HOME_COLLAB_EDITOR_ENTRY_ASSET_PATH =
  'build/static-shell/apps/site/src/shell/home/home-collab-editor-entry.js'

export type HomeCollabEditorEntryModule = {
  installHomeCollabEditor: (options?: { root?: HTMLElement | null }) => () => void
}

type LoadHomeCollabEditorRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomeCollabEditorEntryModule>
}

let homeCollabEditorRuntimePromise: Promise<HomeCollabEditorEntryModule> | null = null

const importHomeCollabEditorRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomeCollabEditorEntryModule

export const resolveHomeCollabEditorRuntimeUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_COLLAB_EDITOR_ENTRY_ASSET_PATH, options)

export const loadHomeCollabEditorRuntime = ({
  assetUrl = resolveHomeCollabEditorRuntimeUrl(),
  importer = importHomeCollabEditorRuntime
}: LoadHomeCollabEditorRuntimeOptions = {}) => {
  if (!homeCollabEditorRuntimePromise) {
    homeCollabEditorRuntimePromise = importer(assetUrl)
  }
  return homeCollabEditorRuntimePromise
}

export const resetHomeCollabEditorRuntimeLoaderForTests = () => {
  homeCollabEditorRuntimePromise = null
}
