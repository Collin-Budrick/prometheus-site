import { isNativeCapacitorRuntime } from './runtime'

const ALWAYS_ON_STORAGE_KEY = 'prometheus:privacy-screen:always-on'

let sensitiveViewActive = false

const getAlwaysOn = () => {
  try {
    return window.localStorage.getItem(ALWAYS_ON_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

const setPluginEnabled = async (enabled: boolean) => {
  if (!isNativeCapacitorRuntime()) return
  const { PrivacyScreen } = await import('@capacitor/privacy-screen')
  if (enabled) {
    await PrivacyScreen.enable()
    return
  }
  await PrivacyScreen.disable()
}

export const setSensitivePrivacyView = async (active: boolean) => {
  sensitiveViewActive = active
  await applyPrivacyScreenPolicy('sensitive-view')
}

export const setPrivacyScreenAlwaysOn = async (enabled: boolean) => {
  try {
    window.localStorage.setItem(ALWAYS_ON_STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    // no-op
  }
  await applyPrivacyScreenPolicy('always-on-toggle')
}

export const getPrivacyScreenAlwaysOn = () => {
  if (typeof window === 'undefined') return false
  return getAlwaysOn()
}

export const applyPrivacyScreenPolicy = async (_source: string) => {
  if (typeof document === 'undefined') return
  const path = window.location.pathname
  const routeSensitive = path.startsWith('/chat') || path.startsWith('/profile')
  const shouldEnable = getAlwaysOn() || routeSensitive || sensitiveViewActive
  await setPluginEnabled(shouldEnable)
}

let initialized = false

export const initPrivacyScreenPolicy = async () => {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  if (!isNativeCapacitorRuntime()) return

  const onPause = () => {
    void setPluginEnabled(true)
  }

  const onResume = () => {
    void applyPrivacyScreenPolicy('resume')
  }

  const onRoute = () => {
    void applyPrivacyScreenPolicy('route')
  }

  window.addEventListener('pause', onPause)
  window.addEventListener('resume', onResume)
  window.addEventListener('popstate', onRoute)

  await applyPrivacyScreenPolicy('init')
}
