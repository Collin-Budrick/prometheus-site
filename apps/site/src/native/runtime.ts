const isStandalonePwa = () => {
  if (typeof window === 'undefined') return false
  if (typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(display-mode: standalone)').matches
}

const isTauriRuntime = () => {
  if (typeof window === 'undefined') return false
  if (isStandalonePwa()) return false

  const runtimeWindow = window as Window & {
    __TAURI__?: unknown
    __TAURI_IPC__?: unknown
  }
  if (typeof runtimeWindow.__TAURI__ !== 'undefined') return true
  if (typeof runtimeWindow.__TAURI_IPC__ !== 'undefined') return true

  const protocol = window.location.protocol
  if (protocol === 'tauri:' || protocol === 'ipc:') return true

  const userAgent = window.navigator.userAgent.toLowerCase()
  return userAgent.includes('tauri')
}

export const isNativeTauriRuntime = () => isTauriRuntime()

export const isNativeShellRuntime = () => isTauriRuntime()
