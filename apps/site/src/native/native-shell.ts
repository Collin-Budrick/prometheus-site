import { App } from '@capacitor/app'
import { Keyboard } from '@capacitor/keyboard'
import { initConnectivityStore } from './connectivity'
import { initNativeNotifications } from './notifications'
import { initPrivacyScreenPolicy } from './privacy-screen-policy'
import { initializeNativeAppExtras } from './native-app-extras'
import { isNativeCapacitorRuntime } from './runtime'
import { initNativeTextZoom } from './text-zoom'
import { isRootRoute, navigateDeepLink } from './deep-links'
import { type NavLabelKey } from '../config'
import { getLanguagePack } from '../lang'
import { defaultLang, supportedLangs, type Lang } from '../shared/lang-store'

type NativeShellState = {
  initialized: boolean
  cleanup: (() => void) | null
  keyboardHeight: number
  lastBackAt: number
}

type NativeBackPhase = 'dismiss' | 'navigate'

type NativeBackIntentDetail = {
  phase: NativeBackPhase
}

declare global {
  var __prometheusNativeShell: NativeShellState | undefined
  var __prometheusNativeRuntime: boolean | undefined
  interface WindowEventMap {
    'prometheus:native-back-intent': CustomEvent<NativeBackIntentDetail>
  }
}

const BACK_EXIT_GUARD_MS = 1_200

const getNativeShellState = (): NativeShellState => {
  if (!globalThis.__prometheusNativeShell) {
    globalThis.__prometheusNativeShell = {
      initialized: false,
      cleanup: null,
      keyboardHeight: 0,
      lastBackAt: 0
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
  const bounded = Number.isFinite(height) ? Math.max(0, Math.round(height)) : 0
  const root = document.documentElement
  root.style.setProperty('--kbd', `${bounded}px`)
  root.dataset.keyboardOpen = bounded > 0 ? 'true' : 'false'
  getNativeShellState().keyboardHeight = bounded
}

const dispatchBackIntent = (phase: NativeBackPhase) => {
  const event = new CustomEvent<NativeBackIntentDetail>('prometheus:native-back-intent', {
    cancelable: true,
    detail: { phase }
  })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

const tryDismissVisibleUi = () => {
  if (dispatchBackIntent('dismiss')) return true
  const closeCandidates = [
    '[data-native-dismiss="true"]',
    '[data-native-overlay="true"] [data-close="true"]',
    '.chat-profile-backdrop',
    '.chat-invites-dm-close',
    '.chat-invites-dm-gear[data-open="true"]',
    '[aria-modal="true"] [aria-label="Close"]'
  ]
  for (const selector of closeCandidates) {
    const node = document.querySelector<HTMLElement>(selector)
    if (!node) continue
    if (node.hasAttribute('disabled') || node.getAttribute('aria-disabled') === 'true') continue
    node.click()
    return true
  }
  return false
}

const maybeCloseKeyboard = async () => {
  const state = getNativeShellState()
  const active = document.activeElement as HTMLElement | null
  const shouldBlur = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
  if (!shouldBlur && state.keyboardHeight <= 0) return false
  active?.blur()
  try {
    await Keyboard.hide()
  } catch {
    // no-op: unsupported on some platforms
  }
  setKeyboardHeight(0)
  return true
}

const handleDeepLink = (rawUrl: string | null | undefined) => {
  navigateDeepLink(rawUrl)
}

const maybeNavigateBack = () => {
  if (dispatchBackIntent('navigate')) return true
  if (window.history.length <= 1 || isRootRoute()) return false
  window.history.back()
  return true
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

const maybeExitApp = async () => {
  if (!isRootRoute()) return false
  const state = getNativeShellState()
  const now = Date.now()
  if (now - state.lastBackAt < BACK_EXIT_GUARD_MS) {
    await App.exitApp()
    return true
  }
  state.lastBackAt = now
  return true
}

const handleNativeBack = async () => {
  if (tryDismissVisibleUi()) return
  if (await maybeCloseKeyboard()) return
  if (maybeNavigateBack()) return
  await maybeExitApp()
}

const setupNativeListeners = () => {
  if (typeof window === 'undefined') return () => {}

  const pluginHandles: Array<{ remove: () => Promise<void> }> = []
  const addPluginListener = async (register: Promise<{ remove: () => Promise<void> }> | { remove: () => Promise<void> }) => {
    const handle = await register
    pluginHandles.push(handle)
  }

  const onResume = () => applyNativeState(true)
  const onPause = () => applyNativeState(false)

  applyNativeState(true)
  setKeyboardHeight(0)
  window.addEventListener('resume', onResume)
  window.addEventListener('pause', onPause)

  void addPluginListener(Keyboard.addListener('keyboardWillShow', (event) => setKeyboardHeight(event.keyboardHeight)))
  void addPluginListener(Keyboard.addListener('keyboardDidShow', (event) => setKeyboardHeight(event.keyboardHeight)))
  void addPluginListener(Keyboard.addListener('keyboardWillHide', () => setKeyboardHeight(0)))
  void addPluginListener(Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0)))

  void addPluginListener(App.addListener('backButton', () => {
    void handleNativeBack()
  }))

  void addPluginListener(App.addListener('appUrlOpen', ({ url }) => {
    handleDeepLink(url)
  }))

  void App.getLaunchUrl()
    .then((launch) => {
      handleDeepLink(launch?.url)
    })
    .catch(() => {
      handleDeepLink('/')
    })

  return () => {
    setKeyboardHeight(0)
    window.removeEventListener('resume', onResume)
    window.removeEventListener('pause', onPause)
    for (const handle of pluginHandles) {
      void handle.remove()
    }
  }
}

export const initNativeShell = () => {
  const isNativeRuntime = isNativeCapacitorRuntime()
  window.__prometheusNativeRuntime = isNativeRuntime

  const state = getNativeShellState()
  state.cleanup?.()
  state.cleanup = null

  void initConnectivityStore()

  if (!isNativeRuntime) {
    state.initialized = false
    setKeyboardHeight(0)
    return
  }

  state.cleanup = setupNativeListeners()
  void initNativeNotifications()
  void initNativeTextZoom()
  void initPrivacyScreenPolicy()
  void initializeNativeAppExtras({ labelResolver: resolveNativeLabelResolver() })
  state.initialized = true
}

export const hideNativeSplashScreen = async () => {
  if (!isNativeCapacitorRuntime()) return
  const { SplashScreen } = await import('@capacitor/splash-screen')
  await SplashScreen.hide()
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    const state = getNativeShellState()
    state.cleanup?.()
    state.cleanup = null
    state.initialized = false
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--kbd', '0px')
      document.documentElement.dataset.keyboardOpen = 'false'
    }
  })
}
