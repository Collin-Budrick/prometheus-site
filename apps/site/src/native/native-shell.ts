import { initConnectivityStore } from './connectivity'
import { initNativeNotifications } from './notifications'
import { initPrivacyScreenPolicy } from './privacy-screen-policy'
import {
  disposeNativeAutomaticAppActions,
  hydrateTauriStartupDeepLink,
  initializeNativeAppExtras,
  initializeNativeAutomaticAppActions,
  initializeTauriOpenUrlListener,
  runNativeAutomaticAppActionsOnResume
} from './native-app-extras'
import { isNativeShellRuntime, isNativeTauriRuntime } from './runtime'
import { invokeNativeCommand } from './bridge'
import { initNativeTextZoom } from './text-zoom'
import { type NavLabelKey } from '../config'
import { getLanguagePack } from '../lang'
import { defaultLang, supportedLangs, type Lang } from '../shared/lang-store'

type NativeShellState = {
  initialized: boolean
  cleanup: (() => void) | null
  keyboardHeight: number
}

declare global {
  var __prometheusNativeShell: NativeShellState | undefined
  var __prometheusNativeRuntime: boolean | undefined
}

const getNativeShellState = (): NativeShellState => {
  if (!globalThis.__prometheusNativeShell) {
    globalThis.__prometheusNativeShell = {
      initialized: false,
      cleanup: null,
      keyboardHeight: 0
    }
  }
  return globalThis.__prometheusNativeShell
}

const applyNativeState = (active: boolean) => {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.nativeShell = active ? 'native' : 'background'
}

const setKeyboardHeight = (height: number) => {
  if (typeof document === 'undefined') return
  const bounded = Number.isFinite(height) ? Math.max(0, Math.round(height)) : 0
  const root = document.documentElement
  root.style.setProperty('--kbd', `${bounded}px`)
  root.dataset.keyboardOpen = bounded > 0 ? 'true' : 'false'
  getNativeShellState().keyboardHeight = bounded
}

const resolveNativeLabelResolver = () => {
  if (typeof document === 'undefined') return undefined
  const raw = document.documentElement.lang || defaultLang
  const normalizedLang = raw.split(/[-_]/)[0] ?? raw
  const resolved = supportedLangs.includes(normalizedLang as Lang) ? (normalizedLang as Lang) : defaultLang
  const ui = getLanguagePack(resolved).ui
  return (key: NavLabelKey) => {
    const value = (ui as Record<string, string>)[key]
    return typeof value === 'string' && value.trim() ? value : key
  }
}

export const initNativeShell = () => {
  if (typeof window === 'undefined') return

  const isNativeRuntime = isNativeShellRuntime()
  window.__prometheusNativeRuntime = isNativeRuntime

  const state = getNativeShellState()
  state.cleanup?.()
  state.cleanup = null

  void initConnectivityStore()

  if (!isNativeRuntime) {
    state.initialized = false
    setKeyboardHeight(0)
    applyNativeState(false)
    return
  }

  applyNativeState(true)
  setKeyboardHeight(0)
  void initNativeNotifications()
  void initNativeTextZoom()
  void initPrivacyScreenPolicy()
  void initializeNativeAppExtras({ labelResolver: resolveNativeLabelResolver() })
  void initializeNativeAutomaticAppActions()

  if (isNativeTauriRuntime()) {
    let removeTauriListener = () => {}
    const onFocus = () => {
      void runNativeAutomaticAppActionsOnResume()
    }
    const onNativeResume = () => {
      void runNativeAutomaticAppActionsOnResume()
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('prom:native-resume', onNativeResume as EventListener)
    void initializeTauriOpenUrlListener().then((removeListener) => {
      removeTauriListener = removeListener
    })
    void hydrateTauriStartupDeepLink()

    state.cleanup = () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('prom:native-resume', onNativeResume as EventListener)
      removeTauriListener()
      disposeNativeAutomaticAppActions()
      setKeyboardHeight(0)
    }
  } else {
    state.cleanup = () => {
      disposeNativeAutomaticAppActions()
      setKeyboardHeight(0)
    }
  }

  state.initialized = true
}

export const hideNativeSplashScreen = async () => {
  if (!isNativeTauriRuntime()) return false
  const hidden = await invokeNativeCommand<boolean>('hide_native_splash')
  return hidden === true
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    const state = getNativeShellState()
    state.cleanup?.()
    state.cleanup = null
    state.initialized = false
    disposeNativeAutomaticAppActions()
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--kbd', '0px')
      document.documentElement.dataset.keyboardOpen = 'false'
    }
  })
}
