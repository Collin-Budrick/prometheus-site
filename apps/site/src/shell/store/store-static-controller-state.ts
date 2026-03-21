type StoreStaticControllerCleanup = () => void

type StoreStaticControllerWindow = Window & {
  __PROM_STATIC_STORE_BOOTSTRAP__?: boolean
  __PROM_STATIC_STORE_CONTROLLER_CLEANUP__?: StoreStaticControllerCleanup | null
}

const getStoreStaticControllerWindow = () =>
  (typeof window !== 'undefined' ? (window as StoreStaticControllerWindow) : null)

export const hasRegisteredStoreStaticController = () => {
  const win = getStoreStaticControllerWindow()
  return typeof win?.__PROM_STATIC_STORE_CONTROLLER_CLEANUP__ === 'function'
}

export const registerStoreStaticControllerCleanup = (cleanup: StoreStaticControllerCleanup) => {
  const win = getStoreStaticControllerWindow()
  if (!win) return
  win.__PROM_STATIC_STORE_BOOTSTRAP__ = true
  win.__PROM_STATIC_STORE_CONTROLLER_CLEANUP__ = cleanup
}

export const consumeRegisteredStoreStaticControllerCleanup = () => {
  const win = getStoreStaticControllerWindow()
  const cleanup = win?.__PROM_STATIC_STORE_CONTROLLER_CLEANUP__
  if (!win || typeof cleanup !== 'function') {
    return null
  }
  win.__PROM_STATIC_STORE_CONTROLLER_CLEANUP__ = null
  return cleanup
}

export const clearStoreStaticBootstrapFlag = () => {
  const win = getStoreStaticControllerWindow()
  if (!win) return
  win.__PROM_STATIC_STORE_BOOTSTRAP__ = false
}
