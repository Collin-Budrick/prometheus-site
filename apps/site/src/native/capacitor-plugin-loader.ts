import { isNativeCapacitorRuntime } from './runtime'

const pluginLoadCache = new Map<string, Promise<unknown>>()

export const loadNativePlugin = async <T>(moduleId: string): Promise<T | null> => {
  if (!isNativeCapacitorRuntime() || typeof window === 'undefined') return null

  const cached = pluginLoadCache.get(moduleId)
  if (cached) {
    return (cached as Promise<T | null>)
  }

  const load = (async () => {
    try {
      return (await import(/* @vite-ignore */ moduleId)) as T
    } catch {
      return null
    }
  })()

  pluginLoadCache.set(moduleId, load)
  return load
}
