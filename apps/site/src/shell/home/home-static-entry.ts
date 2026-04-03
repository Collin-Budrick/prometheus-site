import { loadHomePostAnchorCore } from './runtime-loaders'
import '../../fragment/route-warmup-bridge-auto'

type InstallHomeStaticEntryOptions = Parameters<
  typeof import('./home-post-anchor-core').installHomeStaticEntry
>[0] & {
  loadCore?: typeof loadHomePostAnchorCore
}

let homePostAnchorCoreModulePromise: ReturnType<typeof loadHomePostAnchorCore> | null = null
let homeStaticEntryInstallPromise: Promise<(() => void) | undefined> | null = null
let homeStaticEntryCleanup: (() => void) | undefined
let homeStaticEntryDisposed = false

const startHomeStaticEntryInstall = ({
  loadCore = loadHomePostAnchorCore,
  ...options
}: InstallHomeStaticEntryOptions = {}) => {
  homePostAnchorCoreModulePromise ??= loadCore()
  if (!homeStaticEntryInstallPromise) {
    homeStaticEntryInstallPromise = homePostAnchorCoreModulePromise
      .then(({ installHomeStaticEntry }) => {
        homeStaticEntryCleanup = installHomeStaticEntry(options)
        if (homeStaticEntryDisposed) {
          homeStaticEntryCleanup?.()
        }
        return homeStaticEntryCleanup
      })
      .catch((error) => {
        homeStaticEntryInstallPromise = null
        console.error('Static home post-anchor core failed:', error)
        return undefined
      })
  }

  return homeStaticEntryInstallPromise
}

export const installHomeStaticEntry = ({
  ...options
}: InstallHomeStaticEntryOptions = {}) => {
  void startHomeStaticEntryInstall(options)

  return () => {
    homeStaticEntryDisposed = true
    homeStaticEntryCleanup?.()
  }
}

export const waitForHomeStaticEntryInstallation = (
  options?: InstallHomeStaticEntryOptions
) => startHomeStaticEntryInstall(options).then(() => undefined)

export const primeHomeSettingsInteraction = async (
  target: EventTarget | null = null,
  options?: InstallHomeStaticEntryOptions
) => {
  await waitForHomeStaticEntryInstallation(options)
  const module = await homePostAnchorCoreModulePromise
  await module?.primeHomeSettingsInteraction?.(target)
}

if (typeof window !== 'undefined') {
  const cleanup = installHomeStaticEntry()
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      cleanup()
    })
  }
}
