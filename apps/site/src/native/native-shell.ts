import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'

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
  interface WindowEventMap {
    'prometheus:native-back-intent': CustomEvent<NativeBackIntentDetail>
  }
}

const ROOT_PATH = '/'
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

const isStandalonePwa = () => {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches
}

const isNativeCapacitorRuntime = () => {
  if (typeof window === 'undefined') return false
  if (isStandalonePwa()) return false
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() !== 'web'
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

const normalizePath = (input: string) => {
  const [pathWithSearch, hash = ''] = input.split('#')
  const [pathnameRaw, search = ''] = pathWithSearch.split('?')
  const pathname = pathnameRaw.length > 1 ? pathnameRaw.replace(/\/+$/, '') : pathnameRaw
  return `${pathname || '/'}${search ? `?${search}` : ''}${hash ? `#${hash}` : ''}`
}

const isRootRoute = () => {
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  return normalizePath(current) === ROOT_PATH
}

const navigateToPath = (path: string) => {
  const target = normalizePath(path)
  const current = normalizePath(`${window.location.pathname}${window.location.search}${window.location.hash}`)
  if (target === current) return
  window.history.pushState({}, '', target)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

const normalizeDeepLinkPath = (rawUrl: string | null | undefined) => {
  const value = rawUrl?.trim()
  if (!value) return null
  try {
    const parsed = new URL(value)
    const protocol = parsed.protocol.toLowerCase()
    if (protocol === 'http:' || protocol === 'https:') {
      return normalizePath(`${parsed.pathname}${parsed.search}${parsed.hash}`)
    }
    const path = parsed.pathname || parsed.host || parsed.href.replace(`${parsed.protocol}//`, '')
    return normalizePath(path.startsWith('/') ? path : `/${path}`)
  } catch {
    if (value.startsWith('/')) return normalizePath(value)
    if (value.startsWith('?') || value.startsWith('#')) return normalizePath(`/${value}`)
    return ROOT_PATH
  }
}

const handleDeepLink = (rawUrl: string | null | undefined) => {
  const path = normalizeDeepLinkPath(rawUrl)
  if (!path) return
  navigateToPath(path)
}

const maybeNavigateBack = () => {
  if (dispatchBackIntent('navigate')) return true
  if (window.history.length <= 1 || isRootRoute()) return false
  window.history.back()
  return true
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
      handleDeepLink(ROOT_PATH)
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
  const state = getNativeShellState()
  state.cleanup?.()
  state.cleanup = null

  if (!isNativeCapacitorRuntime()) {
    state.initialized = false
    setKeyboardHeight(0)
    return
  }

  state.cleanup = setupNativeListeners()
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
