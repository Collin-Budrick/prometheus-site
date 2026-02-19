import { isNativeTauriRuntime } from './runtime'

export type InvokeArgs = Record<string, unknown>

export const isNativeBridgeAvailable = () => isNativeTauriRuntime()

const importNativePlugin = async (moduleId: string): Promise<unknown | null> => {
  switch (moduleId) {
    case '@tauri-apps/api/core':
      return import('@tauri-apps/api/core')
    case '@tauri-apps/plugin-deep-link':
      return import('@tauri-apps/plugin-deep-link')
    case '@tauri-apps/plugin-shell':
      return import('@tauri-apps/plugin-shell')
    case '@tauri-apps/plugin-dialog':
      return import('@tauri-apps/plugin-dialog')
    case '@tauri-apps/plugin-notification':
      return import('@tauri-apps/plugin-notification')
    case '@tauri-apps/plugin-sql':
      return import('@tauri-apps/plugin-sql')
    case '@tauri-apps/plugin-global-shortcut':
      return import('@tauri-apps/plugin-global-shortcut')
    case '@tauri-apps/plugin-updater':
      return import('@tauri-apps/plugin-updater')
    default:
      return null
  }
}

export const loadNativePlugin = async <T = unknown>(moduleId: string): Promise<T | null> => {
  if (!isNativeBridgeAvailable()) return null
  try {
    const mod = await importNativePlugin(moduleId)
    if (!mod) return null
    return mod as T
  } catch {
    return null
  }
}

export const invokeNativeCommand = async <T = unknown>(command: string, args: InvokeArgs = {}): Promise<T | null> => {
  if (!isNativeBridgeAvailable()) return null
  const core = await loadNativePlugin<{ invoke?: <R>(cmd: string, payload?: InvokeArgs) => Promise<R> }>('@tauri-apps/api/core')
  if (!core || typeof core.invoke !== 'function') return null
  try {
    return await core.invoke<T>(command, args)
  } catch {
    return null
  }
}
