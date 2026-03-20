import type { Lang } from '../lang/types'
import { getActiveHomeController } from './home-active-controller'
import { loadHomeUiControlsRuntime } from './home-ui-controls-runtime-loader'

let homeSettingsInteractionPromise: Promise<boolean> | null = null

const isSettingsTriggerTarget = (target: EventTarget | null) => {
  if (!(target instanceof Element)) {
    return false
  }
  return Boolean(target.closest('[data-static-settings-toggle]'))
}

const replaySettingsToggle = (settingsRoot: HTMLElement | null) => {
  if (!settingsRoot || settingsRoot.dataset.open === 'true') {
    return
  }
  settingsRoot
    .querySelector<HTMLButtonElement>('[data-static-settings-toggle]')
    ?.click()
}

const bindHomeSettingsUiControls = async () => {
  const controller = getActiveHomeController()
  if (!controller || controller.destroyed) {
    return false
  }

  const { bindHomeUiControls } = await loadHomeUiControlsRuntime()
  return (
    bindHomeUiControls({
      controller,
      onLanguageChange: async (nextLang: Lang) => {
        const [
          { swapStaticHomeLanguage },
          { destroyHomeController }
        ] = await Promise.all([
          import('./home-language-runtime'),
          import('./home-bootstrap-controller-utils')
        ])

        await swapStaticHomeLanguage({
          nextLang,
          bootstrapStaticHome: async () => {
            const { bootstrapStaticHome } = await import('./home-bootstrap-orchestrator')
            await bootstrapStaticHome()
          },
          destroyActiveController: async () => {
            await destroyHomeController(getActiveHomeController())
          }
        })
      }
    }) === true
  )
}

export const primeHomeSettingsInteraction = async (
  target: EventTarget | null = null
) => {
  const settingsRoot =
    typeof document !== 'undefined'
      ? document.querySelector<HTMLElement>('.topbar-settings')
      : null

  if (!settingsRoot) {
    return false
  }

  if (!homeSettingsInteractionPromise) {
    homeSettingsInteractionPromise = bindHomeSettingsUiControls().catch((error) => {
      homeSettingsInteractionPromise = null
      console.error('Static home settings interaction runtime failed:', error)
      return false
    })
  }

  const bound = await homeSettingsInteractionPromise
  if (!bound) {
    return false
  }

  if (isSettingsTriggerTarget(target)) {
    replaySettingsToggle(settingsRoot)
  }

  return true
}

export const resetHomeSettingsInteractionRuntimeForTests = () => {
  homeSettingsInteractionPromise = null
}
