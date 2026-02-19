import { isNativeShellRuntime, isNativeTauriRuntime } from './runtime'
import { navigateDeepLink } from './deep-links'
import { emitNativeFeatureTelemetry } from './telemetry'
import { invokeNativeCommand, loadNativePlugin } from './bridge'
import { type NavLabelKey } from '../config'

type NativeExtrasOptions = {
  labelResolver?: (key: NavLabelKey) => string
  telemetry?: boolean
}

type OpenAttemptResult = {
  attempted: boolean
  handled: boolean
}

type NativeFeatureStatus = 'success' | 'fallback' | 'error'
type NativePlatform = 'android' | 'ios' | 'desktop' | 'web'
type NativeReviewTrigger = 'startup' | 'resume' | 'intent' | 'manual'
type NativeUpdateTrigger = 'startup' | 'resume' | 'manual'
type NativeFlow = 'auto' | 'manual'
type PluginLoader = (_moduleId: string) => Promise<unknown | null>
type TelemetryEmitter = (
  feature: string,
  status: NativeFeatureStatus,
  options?: {
    detail?: Record<string, string>
  }
) => void

type ReviewRequestOptions = {
  flow?: NativeFlow
  trigger?: NativeReviewTrigger
  markAttempt?: boolean
}

type GlobalShortcutPlugin = {
  register?: (shortcut: string, handler: () => void) => Promise<void>
  unregisterAll?: () => Promise<void>
}

type UpdaterModule = {
  check?: () => Promise<unknown>
  checkUpdate?: () => Promise<unknown>
  install?: () => Promise<void>
  downloadAndInstall?: () => Promise<void>
}

let nativeRuntimeOverrideForTests: boolean | null = null
let platformOverrideForTests: NativePlatform | null = null
let pluginLoaderOverrideForTests: PluginLoader | null = null
let telemetryEmitterOverrideForTests: TelemetryEmitter | null = null

let automaticActionsInitialized = false
let shortcutsInitialized = false

const BACKGROUND_RUNNER_LABEL = 'dev.prometheus.site.background.task'

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

const getIsNativeRuntime = () => {
  if (nativeRuntimeOverrideForTests !== null) return nativeRuntimeOverrideForTests
  return isNativeShellRuntime()
}

const isSafeExternalUrl = (value: string) => {
  const href = value.trim()
  return href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('tel:')
}

const getTelemetryEmitter = () => telemetryEmitterOverrideForTests ?? emitNativeFeatureTelemetry

const emitFeatureTelemetry = (
  feature: string,
  status: NativeFeatureStatus,
  detail?: {
    flow?: NativeFlow
    trigger?: NativeReviewTrigger | NativeUpdateTrigger
    outcome?: string
    platform?: NativePlatform
  }
) => {
  const tags: Record<string, string> = {}
  if (detail?.flow) tags.flow = detail.flow
  if (detail?.trigger) tags.trigger = detail.trigger
  if (detail?.outcome) tags.outcome = detail.outcome
  if (detail?.platform) tags.platform = detail.platform
  getTelemetryEmitter()(feature, status, Object.keys(tags).length > 0 ? { detail: tags } : undefined)
}

const resolveNativePlatform = (): NativePlatform => {
  if (platformOverrideForTests) return platformOverrideForTests
  if (typeof window === 'undefined') return 'web'
  const ua = window.navigator.userAgent.toLowerCase()
  if (ua.includes('android')) return 'android'
  if (ua.includes('iphone') || ua.includes('ipad')) return 'ios'
  if (ua.includes('tauri')) return 'desktop'
  return 'web'
}

const normalizeTauriDeepLinkUrls = (value: unknown) => {
  if (!value) return []
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? [trimmed] : []
  }
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => (typeof entry === 'string' ? (entry.trim() ? [entry.trim()] : []) : []))
}

const handleDeepLink = (rawUrl: string | null | undefined) => navigateDeepLink(rawUrl)

const loadPlugin = async <T = unknown>(moduleId: string): Promise<T | null> => {
  if (pluginLoaderOverrideForTests) {
    return (await pluginLoaderOverrideForTests(moduleId)) as T | null
  }
  return loadNativePlugin<T>(moduleId)
}

const isDesktopRuntime = () => getIsNativeRuntime() && resolveNativePlatform() === 'desktop'

const initializeDesktopShortcuts = async () => {
  if (!isDesktopRuntime() || typeof window === 'undefined') return false
  if (shortcutsInitialized) return true

  const plugin = await loadPlugin<GlobalShortcutPlugin>('@tauri-apps/plugin-global-shortcut')
  if (!plugin?.register) return false

  try {
    await plugin.register('CommandOrControl+,', () => {
      window.dispatchEvent(new CustomEvent('prom:native-menu-preferences', { detail: { id: 'shortcut' } }))
      void navigateDeepLink('/settings')
    })
    await plugin.register('CommandOrControl+Shift+U', () => {
      void checkNativeUpdateInternal('manual')
    })
    shortcutsInitialized = true
    return true
  } catch {
    return false
  }
}

const disposeDesktopShortcuts = async () => {
  shortcutsInitialized = false
  const plugin = await loadPlugin<GlobalShortcutPlugin>('@tauri-apps/plugin-global-shortcut')
  if (!plugin?.unregisterAll) return
  try {
    await plugin.unregisterAll()
  } catch {
    // no-op
  }
}

const resolveUpdaterCheck = async () => {
  const module = await loadPlugin<UpdaterModule>('@tauri-apps/plugin-updater')
  if (!module) return null

  const check = module.check ?? module.checkUpdate
  if (typeof check !== 'function') return null

  try {
    return await check()
  } catch {
    return null
  }
}

const installFromCheckResult = async (result: unknown, updater: UpdaterModule | null) => {
  if (!result || typeof result !== 'object') return false

  const value = result as {
    available?: unknown
    version?: unknown
    downloadAndInstall?: () => Promise<void>
  }

  const updateAvailable =
    value.available === true || typeof value.version === 'string' || typeof value.downloadAndInstall === 'function'
  if (!updateAvailable) return false

  try {
    if (typeof value.downloadAndInstall === 'function') {
      await value.downloadAndInstall()
      return true
    }
    if (updater?.downloadAndInstall) {
      await updater.downloadAndInstall()
      return true
    }
    if (updater?.install) {
      await updater.install()
      return true
    }
  } catch {
    return false
  }

  return false
}

const checkNativeUpdateInternal = async (trigger: NativeUpdateTrigger) => {
  if (!getIsNativeRuntime()) return false

  const platform = resolveNativePlatform()
  const rustResult = await invokeNativeCommand<{
    checked?: boolean
    available?: boolean
    installed?: boolean
    status?: string
  }>('native_update_check', { trigger })

  if (platform !== 'desktop') {
    emitFeatureTelemetry('native-update-check', 'fallback', {
      flow: 'manual',
      trigger,
      outcome: 'unsupported-platform',
      platform
    })
    return false
  }

  const updater = await loadPlugin<UpdaterModule>('@tauri-apps/plugin-updater')
  const checkResult = await resolveUpdaterCheck()
  const installed = await installFromCheckResult(checkResult, updater)

  if (installed || rustResult?.checked || rustResult?.status === 'checked') {
    emitFeatureTelemetry('native-update-check', 'success', {
      flow: 'manual',
      trigger,
      outcome: installed ? 'installed' : rustResult?.available ? 'available' : 'checked',
      platform
    })
    return true
  }

  emitFeatureTelemetry('native-update-check', 'fallback', {
    flow: 'manual',
    trigger,
    outcome: 'unavailable',
    platform
  })
  return false
}

export const isExternalHttpUrl = (raw: string) => {
  const parsed = resolveUrl(raw)
  if (!parsed) return false
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  return parsed.origin !== window.location.origin
}

export const openExternalUrl = async (rawUrl: string): Promise<OpenAttemptResult> => {
  const parsed = resolveUrl(rawUrl)
  if (!parsed) return { attempted: false, handled: false }
  const href = parsed.toString()
  if (!isSafeExternalUrl(href)) return { attempted: false, handled: false }

  if (isNativeTauriRuntime()) {
    const shellPlugin = await loadPlugin<{ open?: (url: string) => Promise<void> }>('@tauri-apps/plugin-shell')
    if (shellPlugin?.open) {
      try {
        await shellPlugin.open(href)
        return { attempted: true, handled: true }
      } catch {
        // fallback below
      }
    }
  }

  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    window.open(href, '_blank', 'noopener,noreferrer')
    return { attempted: true, handled: false }
  }

  return { attempted: false, handled: false }
}

export const initializeTauriOpenUrlListener = async () => {
  if (!isNativeTauriRuntime()) return () => {}
  try {
    const deepLinkPlugin = await loadPlugin<{
      onOpenUrl?: (handler: (urls: unknown) => void) => Promise<(() => void) | (() => Promise<void>)>
    }>('@tauri-apps/plugin-deep-link')
    const onOpenUrl = deepLinkPlugin?.onOpenUrl
    if (typeof onOpenUrl !== 'function') return () => {}

    const unlisten = await onOpenUrl((urls: unknown) => {
      const list = normalizeTauriDeepLinkUrls(urls)
      for (const url of list) {
        handleDeepLink(url)
      }
    })

    if (typeof unlisten === 'function') {
      return () => {
        void unlisten()
      }
    }
  } catch {
    // no-op
  }
  return () => {}
}

export const hydrateTauriStartupDeepLink = async () => {
  if (!isNativeTauriRuntime() || typeof window === 'undefined') return false
  try {
    const deepLinkPlugin = await loadPlugin<{
      getCurrent?: () => Promise<unknown>
    }>('@tauri-apps/plugin-deep-link')
    if (typeof deepLinkPlugin?.getCurrent !== 'function') return false
    const raw = await deepLinkPlugin.getCurrent()
    const urls = normalizeTauriDeepLinkUrls(raw)
    if (!urls.length) return false
    for (const url of urls) {
      handleDeepLink(url)
    }
    return true
  } catch {
    return false
  }
}

export const initializeNativeShortcuts = async () => initializeDesktopShortcuts()

export const initializeNativeShortcutsWithLabels = async (_labelResolver?: (key: NavLabelKey) => string) => {
  return initializeDesktopShortcuts()
}

export const requestNativeReview = async (options: ReviewRequestOptions = {}) => {
  const { flow = 'manual', trigger = 'manual' } = options
  if (!getIsNativeRuntime()) {
    emitFeatureTelemetry('native-review', 'fallback', { flow, trigger, outcome: 'skipped' })
    return false
  }

  const platform = resolveNativePlatform()
  const supported = await invokeNativeCommand<boolean>('native_request_review', { flow, trigger })
  if (supported) {
    emitFeatureTelemetry('native-review', 'success', { flow, trigger, outcome: 'requested', platform })
    return true
  }

  emitFeatureTelemetry('native-review', 'fallback', {
    flow,
    trigger,
    outcome: 'unavailable',
    platform
  })
  return false
}

export const checkNativeUpdate = async () => checkNativeUpdateInternal('manual')

export const initializeNativeAutomaticAppActions = async () => {
  if (!getIsNativeRuntime() || typeof window === 'undefined') return
  if (automaticActionsInitialized) return
  automaticActionsInitialized = true

  void requestNativeReview({ flow: 'auto', trigger: 'startup', markAttempt: true })
  void checkNativeUpdateInternal('startup')
}

export const runNativeAutomaticAppActionsOnResume = async () => {
  if (!getIsNativeRuntime() || typeof window === 'undefined') return
  void requestNativeReview({ flow: 'auto', trigger: 'resume', markAttempt: true })
  void checkNativeUpdateInternal('resume')
  void invokeNativeCommand('native_background_dispatch', {
    label: BACKGROUND_RUNNER_LABEL,
    event: 'app:resume',
    details: { reason: 'app-resume' }
  })
}

export const disposeNativeAutomaticAppActions = () => {
  automaticActionsInitialized = false
  void disposeDesktopShortcuts()
}

export const initializeNativeAppExtras = async (options: NativeExtrasOptions = {}) => {
  const { telemetry = true, labelResolver } = options
  if (!getIsNativeRuntime() || typeof window === 'undefined') return

  try {
    const wasSet = labelResolver
      ? await initializeNativeShortcutsWithLabels(labelResolver)
      : await initializeNativeShortcuts()
    if (telemetry) emitNativeFeatureTelemetry('native-shortcuts-init', wasSet ? 'success' : 'fallback')
  } catch {
    if (telemetry) emitNativeFeatureTelemetry('native-shortcuts-init', 'error')
  }
}

export const initializeNativeReviewFlow = async () => {
  if (!getIsNativeRuntime()) return false
  return requestNativeReview()
}

export const initializeNativeUpdateFlow = async () => {
  if (!getIsNativeRuntime()) return false
  return checkNativeUpdate()
}

export const setNativeAppExtrasRuntimeOverrideForTests = (value: boolean | null) => {
  nativeRuntimeOverrideForTests = value
}

export const setNativeAppExtrasPlatformOverrideForTests = (value: NativePlatform | null) => {
  platformOverrideForTests = value
}

export const setNativeAppExtrasPluginLoaderOverrideForTests = (value: PluginLoader | null) => {
  pluginLoaderOverrideForTests = value
}

export const setNativeAppExtrasTelemetryOverrideForTests = (value: TelemetryEmitter | null) => {
  telemetryEmitterOverrideForTests = value
}

export const resetNativeAppExtrasForTests = () => {
  nativeRuntimeOverrideForTests = null
  platformOverrideForTests = null
  pluginLoaderOverrideForTests = null
  telemetryEmitterOverrideForTests = null
  automaticActionsInitialized = false
  shortcutsInitialized = false
}
