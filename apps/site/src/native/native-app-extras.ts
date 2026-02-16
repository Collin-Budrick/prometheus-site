import { isNativeCapacitorRuntime } from './runtime'
import { loadNativePlugin } from './capacitor-plugin-loader'

type ShortcutPayloadItem = {
  id: string
  title: string
  description?: string
  url: string
  icon?: string
}

type OpenAttemptResult = {
  attempted: boolean
  handled: boolean
}

const resolveUrl = (raw: string) => {
  if (typeof window === 'undefined') return null
  const source = raw.trim()
  if (!source) return null
  try {
    return new URL(source, window.location.href)
  } catch {
    return null
  }
}

export const isExternalHttpUrl = (raw: string) => {
  const parsed = resolveUrl(raw)
  if (!parsed) return false
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  return parsed.origin !== window.location.origin
}

const normalizePlugin = (module: unknown) => {
  if (!module || typeof module !== 'object') return null
  const asRecord = module as Record<string, unknown>
  return (asRecord.Browser ?? asRecord.InAppBrowser ?? asRecord.AppShortcuts ?? asRecord.InAppReview ?? asRecord.AppUpdate ?? module) as
    | Record<string, unknown>
    | null
}

const tryBrowserOpen = async (plugin: Record<string, unknown>, url: string): Promise<boolean> => {
  if (typeof plugin.openInSystemBrowser === 'function') {
    await (plugin.openInSystemBrowser as (options: { url: string }) => Promise<void>)({ url })
    return true
  }
  if (typeof plugin.open === 'function') {
    await (plugin.open as (options: { url: string }) => Promise<void>)({ url })
    return true
  }
  if (typeof plugin.openInExternalBrowser === 'function') {
    await (plugin.openInExternalBrowser as (options: { url: string }) => Promise<void>)({ url })
    return true
  }
  return false
}

export const openExternalUrl = async (rawUrl: string): Promise<OpenAttemptResult> => {
  const parsed = resolveUrl(rawUrl)
  if (!parsed) return { attempted: false, handled: false }

  if (!isNativeCapacitorRuntime()) {
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(parsed.toString(), '_blank', 'noopener,noreferrer')
      return { attempted: true, handled: false }
    }
    return { attempted: false, handled: false }
  }

  const browserPlugin = normalizePlugin(await loadNativePlugin<Record<string, unknown>>('@capacitor/browser'))
  if (browserPlugin && (typeof browserPlugin.open === 'function' || typeof browserPlugin.openInSystemBrowser === 'function')) {
    try {
      await tryBrowserOpen(browserPlugin, parsed.toString())
      return { attempted: true, handled: true }
    } catch {
      // fallback below
    }
  }

  const inAppBrowserPlugin = normalizePlugin(await loadNativePlugin<Record<string, unknown>>('@capacitor/inappbrowser'))
  if (inAppBrowserPlugin) {
    try {
      await tryBrowserOpen(inAppBrowserPlugin, parsed.toString())
      return { attempted: true, handled: true }
    } catch {
      // fallback below
    }
  }

  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    window.open(parsed.toString(), '_blank', 'noopener,noreferrer')
    return { attempted: true, handled: false }
  }

  return { attempted: true, handled: false }
}

const buildQuickShortcutPayload = (): { items: ShortcutPayloadItem[] } => {
  const origin = window.location.origin
  return {
    items: [
      {
        id: 'home',
        title: 'Home',
        description: 'Open home',
        url: `${origin}/`,
        icon: 'ic_home'
      },
      {
        id: 'search',
        title: 'Search',
        description: 'Search the app',
        url: `${origin}/`,
        icon: 'ic_search'
      }
    ]
  }
}

const invokeShortcutSetter = async (
  plugin: Record<string, unknown>,
  payload: { items: ShortcutPayloadItem[] }
): Promise<boolean> => {
  const methods = [
    plugin.setShortcuts,
    plugin.setShortcutItems,
    plugin.setActions,
    plugin.setQuickActions,
    plugin.setDynamicShortcuts
  ]

  for (const method of methods) {
    if (typeof method !== 'function') continue
    try {
      await method.call(plugin, payload)
      return true
    } catch {
      try {
        await method.call(plugin, payload.items)
        return true
      } catch {
        continue
      }
    }
  }
  return false
}

export const initializeNativeShortcuts = async () => {
  if (!isNativeCapacitorRuntime() || typeof window === 'undefined') return false

  const shortcutModule = await loadNativePlugin<unknown>('@capawesome/capacitor-app-shortcuts')
  if (!shortcutModule) return false

  const plugin = normalizePlugin(shortcutModule)
  if (!plugin) return false

  const payload = buildQuickShortcutPayload()
  try {
    return await invokeShortcutSetter(plugin, payload)
  } catch {
    return false
  }
}

export const requestNativeReview = async () => {
  if (!isNativeCapacitorRuntime()) return false

  const reviewModule = await loadNativePlugin<Record<string, unknown>>('@capacitor-community/in-app-review')
  if (!reviewModule) return false
  const plugin = normalizePlugin(reviewModule)
  if (!plugin) return false

  const methods = [plugin.requestReview, plugin.openStore, plugin.requestReviewDialog, plugin.rateApp]
  for (const method of methods) {
    if (typeof method !== 'function') continue
    try {
      await method.call(plugin)
      return true
    } catch {
      continue
    }
  }
  return false
}

export const checkNativeUpdate = async () => {
  if (!isNativeCapacitorRuntime()) return false

  const updateModule = await loadNativePlugin<Record<string, unknown>>('@capawesome/capacitor-app-update')
  if (!updateModule) return false
  const plugin = normalizePlugin(updateModule)
  if (!plugin) return false

  const method = plugin.checkForUpdate ?? plugin.checkForUpdateInfo ?? plugin.getAppUpdateInfo ?? null
  if (typeof method !== 'function') return false

  try {
    await method.call(plugin)
    return true
  } catch {
    return false
  }
}

export const initializeNativeAppExtras = async () => {
  void initializeNativeShortcuts()
}
