import { asTrustedScriptUrl } from '../../security/client'
import { resolveStaticAssetUrl } from '../core/static-asset-url'
import type { installHomeBootstrapPostLcpRuntime } from './home-bootstrap-post-lcp-runtime'

export const HOME_ANCHOR_CORE_ASSET_PATH =
  'build/static-shell/apps/site/src/shell/home/home-anchor-core.js'
export const HOME_BOOTSTRAP_ANCHOR_RUNTIME_ASSET_PATH =
  'build/static-shell/apps/site/src/shell/home/home-bootstrap-anchor-runtime.js'
export const HOME_BOOTSTRAP_DEFERRED_RUNTIME_ASSET_PATH =
  'build/static-shell/apps/site/src/shell/home/home-bootstrap-deferred-runtime.js'
export const HOME_CONTROLLER_RUNTIME_ASSET_PATH =
  'build/static-shell/apps/site/src/shell/home/home-controller-runtime.js'
const HOME_COLLAB_EDITOR_ENTRY_ASSET_PATH =
  'build/static-shell/apps/site/src/shell/home/home-collab-editor-entry.js'
const HOME_COLLAB_ENTRY_ASSET_PATH =
  'build/static-shell/apps/site/src/shell/home/home-collab-entry.js'
export const HOME_COLLAB_WORKER_ASSET_PATH =
  'build/static-shell/apps/site/src/shell/home/home-collab.worker.js'
export const HOME_DEMO_WARM_CORE_ASSET_PATH =
  'build/static-shell/apps/site/src/shell/home/home-demo-warm-core.js'
const HOME_BOOTSTRAP_POST_LCP_RUNTIME_ASSET_PATH =
  'build/static-shell/apps/site/src/shell/home/home-bootstrap-post-lcp-runtime.js'
const HOME_DOCK_AUTH_RUNTIME_ASSET_PATH =
  'build/static-shell/apps/site/src/shell/home/home-dock-auth-runtime.js'
const HOME_LANGUAGE_RUNTIME_ASSET_PATH =
  'build/static-shell/apps/site/src/shell/home/home-language-runtime.js'
export const HOME_POST_ANCHOR_CORE_ASSET_PATH =
  'build/static-shell/apps/site/src/shell/home/home-post-anchor-core.js'
export const HOME_POST_ANCHOR_LANGUAGE_RESTORE_RUNTIME_ASSET_PATH =
  'build/static-shell/apps/site/src/shell/home/home-post-anchor-language-restore-runtime.js'
export const HOME_POST_ANCHOR_LIFECYCLE_RUNTIME_ASSET_PATH =
  'build/static-shell/apps/site/src/shell/home/home-post-anchor-lifecycle-runtime.js'
export const HOME_SETTINGS_INTERACTION_RUNTIME_ASSET_PATH =
  'build/static-shell/apps/site/src/shell/home/home-settings-interaction-runtime.js'
export const HOME_STATIC_ANCHOR_ENTRY_ASSET_PATH =
  'build/static-shell/apps/site/src/shell/home/home-static-anchor-entry.js'
export const HOME_STATIC_ENTRY_ASSET_PATH =
  'build/static-shell/apps/site/src/shell/home/home-static-entry.js'
export const HOME_STATIC_ENTRY_DEMO_WARMUP_ASSET_PATH =
  'build/static-shell/apps/site/src/shell/home/home-static-entry-demo-warmup.js'
const HOME_UI_CONTROLS_RUNTIME_ASSET_PATH =
  'build/static-shell/apps/site/src/shell/home/home-ui-controls-runtime.js'

export type InstallHomeStaticAnchorEntry = (
  options?: Record<string, unknown>
) => (() => void) | undefined

export type HomeAnchorCoreModule = {
  bootstrapStaticHome: () => Promise<void>
  installHomeStaticAnchorEntry: InstallHomeStaticAnchorEntry
}

export type HomeBootstrapRuntimeModule = {
  bootstrapStaticHome: () => Promise<void>
}

export type HomeBootstrapDeferredRuntimeModule = {
  installHomeBootstrapDeferredRuntime: typeof import('./home-bootstrap-deferred-runtime').installHomeBootstrapDeferredRuntime
}

export type HomeControllerRuntimeModule = {
  destroyHomeController: typeof import('./home-controller-runtime').destroyHomeController
}

export type HomeBootstrapPostLcpRuntimeModule = {
  installHomeBootstrapPostLcpRuntime: typeof installHomeBootstrapPostLcpRuntime
}

export type HomeCollabEntryModule = {
  installHomeCollabEntry: (options?: { initialTarget?: EventTarget | null }) => () => void
}

export type HomeCollabEditorEntryModule = {
  installHomeCollabEditor: (options?: { root?: HTMLElement | null }) => () => void
}

export type HomeCollabWorkerLike = Pick<
  Worker,
  'addEventListener' | 'removeEventListener' | 'postMessage' | 'terminate'
>

type HomeCollabWorkerConstructor = new (
  scriptURL: string | URL,
  options?: WorkerOptions
) => HomeCollabWorkerLike

export type HomeDemoWarmCoreModule = {
  warmStaticHomeDemoAssets: typeof import('./home-demo-warm-core').warmStaticHomeDemoAssets
}

export type HomeDockAuthRuntimeModule = {
  refreshHomeDockAuthIfNeeded: typeof import('./home-dock-auth-runtime').refreshHomeDockAuthIfNeeded
  syncHomeDockIfNeeded: typeof import('./home-dock-auth-runtime').syncHomeDockIfNeeded
}

export type HomeLanguageRuntimeModule = {
  restorePreferredStaticHomeLanguage: typeof import('./home-language-runtime').restorePreferredStaticHomeLanguage
  swapStaticHomeLanguage: typeof import('./home-language-runtime').swapStaticHomeLanguage
}

export type HomePostAnchorCoreModule = {
  installHomeStaticEntry: typeof import('./home-post-anchor-core').installHomeStaticEntry
  primeHomeSettingsInteraction: typeof import('./home-post-anchor-core').primeHomeSettingsInteraction
}

export type HomePostAnchorLanguageRestoreRuntimeModule = {
  restorePreferredStaticHomeLanguageIfNeeded: typeof import('./home-post-anchor-language-restore-runtime').restorePreferredStaticHomeLanguageIfNeeded
}

export type HomePostAnchorLifecycleRuntimeModule = {
  installHomePostAnchorLifecycleRuntime: typeof import('./home-post-anchor-lifecycle-runtime').installHomePostAnchorLifecycleRuntime
}

export type HomeSettingsInteractionRuntimeModule = {
  primeHomeSettingsInteraction: typeof import('./home-settings-interaction-runtime').primeHomeSettingsInteraction
}

export type HomeStaticEntryDemoWarmupModule = {
  warmStaticHomeDemoAssets: typeof import('./home-static-entry-demo-warmup').warmStaticHomeDemoAssets
}

export type HomeStaticEntryRuntimeModule = {
  primeHomeSettingsInteraction?: typeof import('./home-static-entry').primeHomeSettingsInteraction
  waitForHomeStaticEntryInstallation?: typeof import('./home-static-entry').waitForHomeStaticEntryInstallation
}

export type HomeUiControlsRuntimeModule = {
  bindHomeUiControls: typeof import('./home-ui-controls-runtime').bindHomeUiControls
}

type LoadHomeAnchorCoreOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomeAnchorCoreModule>
}

type LoadHomeBootstrapRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomeBootstrapRuntimeModule>
}

type LoadHomeBootstrapDeferredRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomeBootstrapDeferredRuntimeModule>
}

type LoadHomeControllerRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomeControllerRuntimeModule>
}

type LoadHomeBootstrapPostLcpRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomeBootstrapPostLcpRuntimeModule>
}

type LoadHomeCollabEntryRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomeCollabEntryModule>
}

type LoadHomeCollabEditorRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomeCollabEditorEntryModule>
}

type LoadHomeDemoWarmCoreOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomeDemoWarmCoreModule>
}

type LoadHomeDockAuthRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomeDockAuthRuntimeModule>
}

type LoadHomeLanguageRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomeLanguageRuntimeModule>
}

type LoadHomePostAnchorCoreOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomePostAnchorCoreModule>
}

type LoadHomePostAnchorLanguageRestoreRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomePostAnchorLanguageRestoreRuntimeModule>
}

type LoadHomePostAnchorLifecycleRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomePostAnchorLifecycleRuntimeModule>
}

type LoadHomeSettingsInteractionRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomeSettingsInteractionRuntimeModule>
}

type LoadHomeStaticEntryDemoWarmupOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomeStaticEntryDemoWarmupModule>
}

type LoadHomeStaticEntryRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomeStaticEntryRuntimeModule>
}

type LoadHomeUiControlsRuntimeOptions = {
  assetUrl?: string
  importer?: (url: string) => Promise<HomeUiControlsRuntimeModule>
}

let homeAnchorCorePromise: Promise<HomeAnchorCoreModule> | null = null
let homeBootstrapRuntimePromise: Promise<HomeBootstrapRuntimeModule> | null = null
let homeBootstrapDeferredRuntimePromise: Promise<HomeBootstrapDeferredRuntimeModule> | null = null
let homeControllerRuntimePromise: Promise<HomeControllerRuntimeModule> | null = null
let homeBootstrapPostLcpRuntimePromise: Promise<HomeBootstrapPostLcpRuntimeModule> | null = null
let homeCollabEntryRuntimePromise: Promise<HomeCollabEntryModule> | null = null
let homeCollabEditorRuntimePromise: Promise<HomeCollabEditorEntryModule> | null = null
let homeDemoWarmCorePromise: Promise<HomeDemoWarmCoreModule> | null = null
let homeDockAuthRuntimePromise: Promise<HomeDockAuthRuntimeModule> | null = null
let homeLanguageRuntimePromise: Promise<HomeLanguageRuntimeModule> | null = null
let homePostAnchorCorePromise: Promise<HomePostAnchorCoreModule> | null = null
let homePostAnchorLanguageRestoreRuntimePromise: Promise<HomePostAnchorLanguageRestoreRuntimeModule> | null =
  null
let homePostAnchorLifecycleRuntimePromise: Promise<HomePostAnchorLifecycleRuntimeModule> | null = null
let homeSettingsInteractionRuntimePromise: Promise<HomeSettingsInteractionRuntimeModule> | null = null
let homeStaticEntryDemoWarmupPromise: Promise<HomeStaticEntryDemoWarmupModule> | null = null
let homeStaticEntryRuntimePromise: Promise<HomeStaticEntryRuntimeModule> | null = null
let homeUiControlsRuntimePromise: Promise<HomeUiControlsRuntimeModule> | null = null

const importHomeAnchorCore = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomeAnchorCoreModule

const importHomeBootstrapRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomeBootstrapRuntimeModule

const importHomeBootstrapDeferredRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomeBootstrapDeferredRuntimeModule

const importHomeControllerRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomeControllerRuntimeModule

const importHomeBootstrapPostLcpRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomeBootstrapPostLcpRuntimeModule

const importHomeCollabEntryRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomeCollabEntryModule

const importHomeCollabEditorRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomeCollabEditorEntryModule

const importHomeDemoWarmCore = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomeDemoWarmCoreModule

const importHomeDockAuthRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomeDockAuthRuntimeModule

const importHomeLanguageRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomeLanguageRuntimeModule

const importHomePostAnchorCore = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomePostAnchorCoreModule

const importHomePostAnchorLanguageRestoreRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomePostAnchorLanguageRestoreRuntimeModule

const importHomePostAnchorLifecycleRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomePostAnchorLifecycleRuntimeModule

const importHomeSettingsInteractionRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomeSettingsInteractionRuntimeModule

const importHomeStaticEntryDemoWarmup = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomeStaticEntryDemoWarmupModule

const importHomeStaticEntryRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomeStaticEntryRuntimeModule

const importHomeUiControlsRuntime = async (url: string) =>
  (await import(/* @vite-ignore */ url)) as HomeUiControlsRuntimeModule

export const resolveHomeAnchorCoreUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_ANCHOR_CORE_ASSET_PATH, options)

export const resolveHomeBootstrapRuntimeUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_BOOTSTRAP_ANCHOR_RUNTIME_ASSET_PATH, options)

export const resolveHomeBootstrapDeferredRuntimeUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_BOOTSTRAP_DEFERRED_RUNTIME_ASSET_PATH, options)

export const resolveHomeControllerRuntimeUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_CONTROLLER_RUNTIME_ASSET_PATH, options)

export const resolveHomeBootstrapPostLcpRuntimeUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_BOOTSTRAP_POST_LCP_RUNTIME_ASSET_PATH, options)

export const resolveHomeCollabEntryRuntimeUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_COLLAB_ENTRY_ASSET_PATH, options)

export const resolveHomeCollabEditorRuntimeUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_COLLAB_EDITOR_ENTRY_ASSET_PATH, options)

export const resolveHomeCollabWorkerUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_COLLAB_WORKER_ASSET_PATH, options)

export const resolveHomeDemoWarmCoreUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_DEMO_WARM_CORE_ASSET_PATH, options)

export const resolveHomeDockAuthRuntimeUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_DOCK_AUTH_RUNTIME_ASSET_PATH, options)

export const resolveHomeLanguageRuntimeUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_LANGUAGE_RUNTIME_ASSET_PATH, options)

export const resolveHomePostAnchorCoreUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_POST_ANCHOR_CORE_ASSET_PATH, options)

export const resolveHomePostAnchorLanguageRestoreRuntimeUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_POST_ANCHOR_LANGUAGE_RESTORE_RUNTIME_ASSET_PATH, options)

export const resolveHomePostAnchorLifecycleRuntimeUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_POST_ANCHOR_LIFECYCLE_RUNTIME_ASSET_PATH, options)

export const resolveHomeSettingsInteractionRuntimeUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_SETTINGS_INTERACTION_RUNTIME_ASSET_PATH, options)

export const resolveHomeStaticEntryDemoWarmupUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_STATIC_ENTRY_DEMO_WARMUP_ASSET_PATH, options)

export const resolveHomeStaticEntryRuntimeUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_STATIC_ENTRY_ASSET_PATH, options)

export const resolveHomeUiControlsRuntimeUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_UI_CONTROLS_RUNTIME_ASSET_PATH, options)

export const loadHomeAnchorCore = ({
  assetUrl = resolveHomeAnchorCoreUrl(),
  importer = importHomeAnchorCore
}: LoadHomeAnchorCoreOptions = {}) => {
  if (!homeAnchorCorePromise) {
    homeAnchorCorePromise = importer(assetUrl)
  }
  return homeAnchorCorePromise
}

export const loadHomeBootstrapRuntime = ({
  assetUrl = resolveHomeBootstrapRuntimeUrl(),
  importer = importHomeBootstrapRuntime
}: LoadHomeBootstrapRuntimeOptions = {}) => {
  if (!homeBootstrapRuntimePromise) {
    homeBootstrapRuntimePromise = importer(assetUrl)
  }
  return homeBootstrapRuntimePromise
}

export const loadHomeBootstrapDeferredRuntime = ({
  assetUrl = resolveHomeBootstrapDeferredRuntimeUrl(),
  importer = importHomeBootstrapDeferredRuntime
}: LoadHomeBootstrapDeferredRuntimeOptions = {}) => {
  if (!homeBootstrapDeferredRuntimePromise) {
    homeBootstrapDeferredRuntimePromise = importer(assetUrl)
  }
  return homeBootstrapDeferredRuntimePromise
}

export const loadHomeControllerRuntime = ({
  assetUrl = resolveHomeControllerRuntimeUrl(),
  importer = importHomeControllerRuntime
}: LoadHomeControllerRuntimeOptions = {}) => {
  if (!homeControllerRuntimePromise) {
    homeControllerRuntimePromise = importer(assetUrl)
  }
  return homeControllerRuntimePromise
}

export const loadHomeBootstrapPostLcpRuntime = ({
  assetUrl = resolveHomeBootstrapPostLcpRuntimeUrl(),
  importer = importHomeBootstrapPostLcpRuntime
}: LoadHomeBootstrapPostLcpRuntimeOptions = {}) => {
  if (!homeBootstrapPostLcpRuntimePromise) {
    homeBootstrapPostLcpRuntimePromise = importer(assetUrl)
  }
  return homeBootstrapPostLcpRuntimePromise
}

export const loadHomeCollabEntryRuntime = ({
  assetUrl = resolveHomeCollabEntryRuntimeUrl(),
  importer = importHomeCollabEntryRuntime
}: LoadHomeCollabEntryRuntimeOptions = {}) => {
  if (!homeCollabEntryRuntimePromise) {
    homeCollabEntryRuntimePromise = importer(assetUrl)
  }
  return homeCollabEntryRuntimePromise
}

export const loadHomeCollabEditorRuntime = ({
  assetUrl = resolveHomeCollabEditorRuntimeUrl(),
  importer = importHomeCollabEditorRuntime
}: LoadHomeCollabEditorRuntimeOptions = {}) => {
  if (!homeCollabEditorRuntimePromise) {
    homeCollabEditorRuntimePromise = importer(assetUrl)
  }
  return homeCollabEditorRuntimePromise
}

export const createHomeCollabWorker = ({
  assetUrl = resolveHomeCollabWorkerUrl(),
  WorkerImpl = typeof Worker !== 'undefined' ? Worker : undefined
}: {
  assetUrl?: string
  WorkerImpl?: HomeCollabWorkerConstructor | undefined
} = {}) => {
  if (!WorkerImpl) {
    return null
  }
  const trustedUrl = asTrustedScriptUrl(assetUrl)
  return new WorkerImpl(trustedUrl as unknown as string, {
    type: 'module',
    name: 'prom-home-collab'
  })
}

export const loadHomeDemoWarmCore = ({
  assetUrl = resolveHomeDemoWarmCoreUrl(),
  importer = importHomeDemoWarmCore
}: LoadHomeDemoWarmCoreOptions = {}) => {
  if (!homeDemoWarmCorePromise) {
    homeDemoWarmCorePromise = importer(assetUrl)
  }
  return homeDemoWarmCorePromise
}

export const loadHomeDockAuthRuntime = ({
  assetUrl = resolveHomeDockAuthRuntimeUrl(),
  importer = importHomeDockAuthRuntime
}: LoadHomeDockAuthRuntimeOptions = {}) => {
  if (!homeDockAuthRuntimePromise) {
    homeDockAuthRuntimePromise = importer(assetUrl)
  }
  return homeDockAuthRuntimePromise
}

export const loadHomeLanguageRuntime = ({
  assetUrl = resolveHomeLanguageRuntimeUrl(),
  importer = importHomeLanguageRuntime
}: LoadHomeLanguageRuntimeOptions = {}) => {
  if (!homeLanguageRuntimePromise) {
    homeLanguageRuntimePromise = importer(assetUrl)
  }
  return homeLanguageRuntimePromise
}

export const loadHomePostAnchorCore = ({
  assetUrl = resolveHomePostAnchorCoreUrl(),
  importer = importHomePostAnchorCore
}: LoadHomePostAnchorCoreOptions = {}) => {
  if (!homePostAnchorCorePromise) {
    homePostAnchorCorePromise = importer(assetUrl)
  }
  return homePostAnchorCorePromise
}

export const loadHomePostAnchorLanguageRestoreRuntime = ({
  assetUrl = resolveHomePostAnchorLanguageRestoreRuntimeUrl(),
  importer = importHomePostAnchorLanguageRestoreRuntime
}: LoadHomePostAnchorLanguageRestoreRuntimeOptions = {}) => {
  if (!homePostAnchorLanguageRestoreRuntimePromise) {
    homePostAnchorLanguageRestoreRuntimePromise = importer(assetUrl)
  }
  return homePostAnchorLanguageRestoreRuntimePromise
}

export const loadHomePostAnchorLifecycleRuntime = ({
  assetUrl = resolveHomePostAnchorLifecycleRuntimeUrl(),
  importer = importHomePostAnchorLifecycleRuntime
}: LoadHomePostAnchorLifecycleRuntimeOptions = {}) => {
  if (!homePostAnchorLifecycleRuntimePromise) {
    homePostAnchorLifecycleRuntimePromise = importer(assetUrl)
  }
  return homePostAnchorLifecycleRuntimePromise
}

export const loadHomeSettingsInteractionRuntime = ({
  assetUrl = resolveHomeSettingsInteractionRuntimeUrl(),
  importer = importHomeSettingsInteractionRuntime
}: LoadHomeSettingsInteractionRuntimeOptions = {}) => {
  if (!homeSettingsInteractionRuntimePromise) {
    homeSettingsInteractionRuntimePromise = importer(assetUrl)
  }
  return homeSettingsInteractionRuntimePromise
}

export const loadHomeStaticEntryDemoWarmup = ({
  assetUrl = resolveHomeStaticEntryDemoWarmupUrl(),
  importer = importHomeStaticEntryDemoWarmup
}: LoadHomeStaticEntryDemoWarmupOptions = {}) => {
  if (!homeStaticEntryDemoWarmupPromise) {
    homeStaticEntryDemoWarmupPromise = importer(assetUrl)
  }
  return homeStaticEntryDemoWarmupPromise
}

export const loadHomeStaticEntryRuntime = ({
  assetUrl = resolveHomeStaticEntryRuntimeUrl(),
  importer = importHomeStaticEntryRuntime
}: LoadHomeStaticEntryRuntimeOptions = {}) => {
  if (!homeStaticEntryRuntimePromise) {
    homeStaticEntryRuntimePromise = importer(assetUrl)
  }
  return homeStaticEntryRuntimePromise
}

export const loadHomeUiControlsRuntime = ({
  assetUrl = resolveHomeUiControlsRuntimeUrl(),
  importer = importHomeUiControlsRuntime
}: LoadHomeUiControlsRuntimeOptions = {}) => {
  if (!homeUiControlsRuntimePromise) {
    homeUiControlsRuntimePromise = importer(assetUrl)
  }
  return homeUiControlsRuntimePromise
}

export const resetHomeRuntimeLoadersForTests = () => {
  homeAnchorCorePromise = null
  homeBootstrapRuntimePromise = null
  homeBootstrapDeferredRuntimePromise = null
  homeControllerRuntimePromise = null
  homeBootstrapPostLcpRuntimePromise = null
  homeCollabEntryRuntimePromise = null
  homeCollabEditorRuntimePromise = null
  homeDemoWarmCorePromise = null
  homeDockAuthRuntimePromise = null
  homeLanguageRuntimePromise = null
  homePostAnchorCorePromise = null
  homePostAnchorLanguageRestoreRuntimePromise = null
  homePostAnchorLifecycleRuntimePromise = null
  homeSettingsInteractionRuntimePromise = null
  homeStaticEntryDemoWarmupPromise = null
  homeStaticEntryRuntimePromise = null
  homeUiControlsRuntimePromise = null
}

export const resetHomeAnchorCoreLoaderForTests = resetHomeRuntimeLoadersForTests
export const resetHomeBootstrapRuntimeLoaderForTests = resetHomeRuntimeLoadersForTests
export const resetHomeBootstrapDeferredRuntimeLoaderForTests = resetHomeRuntimeLoadersForTests
export const resetHomeControllerRuntimeLoaderForTests = resetHomeRuntimeLoadersForTests
export const resetHomeBootstrapPostLcpRuntimeLoaderForTests = resetHomeRuntimeLoadersForTests
export const resetHomeCollabEntryRuntimeLoaderForTests = resetHomeRuntimeLoadersForTests
export const resetHomeCollabEditorRuntimeLoaderForTests = resetHomeRuntimeLoadersForTests
export const resetHomeDemoWarmCoreLoaderForTests = resetHomeRuntimeLoadersForTests
export const resetHomeDockAuthRuntimeLoaderForTests = resetHomeRuntimeLoadersForTests
export const resetHomeLanguageRuntimeLoaderForTests = resetHomeRuntimeLoadersForTests
export const resetHomePostAnchorCoreLoaderForTests = resetHomeRuntimeLoadersForTests
export const resetHomePostAnchorLifecycleRuntimeLoaderForTests = resetHomeRuntimeLoadersForTests
export const resetHomeSettingsInteractionRuntimeLoaderForTests = resetHomeRuntimeLoadersForTests
export const resetHomeStaticEntryDemoWarmupLoaderForTests = resetHomeRuntimeLoadersForTests
export const resetHomeStaticEntryRuntimeLoaderForTests = resetHomeRuntimeLoadersForTests
export const resetHomeUiControlsRuntimeLoaderForTests = resetHomeRuntimeLoadersForTests
