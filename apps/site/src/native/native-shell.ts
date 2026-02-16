import { Capacitor } from '@capacitor/core'

type NativeShellState = {
  initialized: boolean
  cleanup: (() => void) | null
}

declare global {
  var __prometheusNativeShell: NativeShellState | undefined
}

const getNativeShellState = (): NativeShellState => {
  if (!globalThis.__prometheusNativeShell) {
    globalThis.__prometheusNativeShell = {
      initialized: false,
      cleanup: null
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

const setupNativeListeners = () => {
  if (typeof window === 'undefined') return () => {}

  const onResume = () => applyNativeState(true)
  const onPause = () => applyNativeState(false)
  const onBackButton = () => {
    document.documentElement.dataset.nativeBackButton = String(Date.now())
  }

  applyNativeState(true)
  window.addEventListener('resume', onResume)
  window.addEventListener('pause', onPause)
  window.addEventListener('backbutton', onBackButton)

  return () => {
    window.removeEventListener('resume', onResume)
    window.removeEventListener('pause', onPause)
    window.removeEventListener('backbutton', onBackButton)
  }
}

export const initNativeShell = () => {
  const state = getNativeShellState()
  state.cleanup?.()
  state.cleanup = null

  if (!isNativeCapacitorRuntime()) {
    state.initialized = false
    return
  }

  state.cleanup = setupNativeListeners()
  state.initialized = true
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    const state = getNativeShellState()
    state.cleanup?.()
    state.cleanup = null
    state.initialized = false
  })
}
