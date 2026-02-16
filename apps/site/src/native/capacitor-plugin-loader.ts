import { isNativeCapacitorRuntime } from './runtime'

const pluginLoadCache = new Map<string, Promise<unknown>>()

const resolvePluginExport = (value: unknown) => {
  if (!value || typeof value !== 'object') return value
  const asRecord = value as Record<string, unknown>
  const fallback = asRecord.default
  return fallback && typeof fallback === 'object' ? fallback : value
}

export const loadNativePlugin = async <T>(moduleId: string): Promise<T | null> => {
  if (!isNativeCapacitorRuntime() || typeof window === 'undefined') return null

  const cached = pluginLoadCache.get(moduleId)
  if (cached) {
    return resolvePluginExport(await cached) as T | null
  }

  const load = (async () => {
    try {
      return resolvePluginExport(await import(/* @vite-ignore */ moduleId)) as T
    } catch {
      return null
    }
  })()

  pluginLoadCache.set(moduleId, load)
  return load as Promise<T | null>
}
