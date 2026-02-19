import { invokeNativeCommand } from './bridge'
import { isNativeShellRuntime } from './runtime'

const ALWAYS_ON_STORAGE_KEY = 'prometheus:privacy-screen:always-on'

let sensitiveViewActive = false

const getAlwaysOn = () => {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(ALWAYS_ON_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

const setPluginEnabled = async (enabled: boolean, source: string) => {
  if (!isNativeShellRuntime()) return
  await invokeNativeCommand<boolean>('native_privacy_screen_set', { enabled, source })
}

export const setSensitivePrivacyView = async (active: boolean) => {
  sensitiveViewActive = active
  await applyPrivacyScreenPolicy('sensitive-view')
}

export const setPrivacyScreenAlwaysOn = async (enabled: boolean) => {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(ALWAYS_ON_STORAGE_KEY, enabled ? '1' : '0')
    } catch {
      // no-op
    }
  }
  await applyPrivacyScreenPolicy('always-on-toggle')
}

export const getPrivacyScreenAlwaysOn = () => {
  if (typeof window === 'undefined') return false
  return getAlwaysOn()
}

const isSensitiveRoute = (path: string) => path.startsWith('/chat') || path.startsWith('/profile') || path.startsWith('/settings')

const isBackgrounded = () => typeof document !== 'undefined' && document.visibilityState !== 'visible'

export const applyPrivacyScreenPolicy = async (source: string) => {
  if (typeof window === 'undefined') return
  const routeSensitive = isSensitiveRoute(window.location.pathname)
  const shouldEnable = getAlwaysOn() || routeSensitive || sensitiveViewActive || isBackgrounded()
  await setPluginEnabled(shouldEnable, source)
}

let initialized = false

export const initPrivacyScreenPolicy = async () => {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  const onRoute = () => {
    void applyPrivacyScreenPolicy('route')
  }

  const onVisibility = () => {
    void applyPrivacyScreenPolicy('visibility')
  }

  window.addEventListener('popstate', onRoute)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('focus', onVisibility)
  window.addEventListener('blur', onVisibility)

  await applyPrivacyScreenPolicy('init')
}
