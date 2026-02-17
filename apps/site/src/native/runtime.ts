import { Capacitor } from '@capacitor/core'

const isStandalonePwa = () => {
  if (typeof window === 'undefined') return false
  if (typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(display-mode: standalone)').matches
}

export const isNativeCapacitorRuntime = () => {
  if (typeof window === 'undefined') return false
  if (isStandalonePwa()) return false
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() !== 'web'
}
