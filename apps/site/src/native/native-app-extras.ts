import { isNativeShellRuntime, isNativeTauriRuntime } from './runtime'
import { navigateDeepLink } from './deep-links'
import { emitNativeFeatureTelemetry } from './telemetry'
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
type NativePlatform = 'android' | 'ios' | 'web'
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

let nativeRuntimeOverrideForTests: boolean | null = null
let platformOverrideForTests: NativePlatform | null = null
let pluginLoaderOverrideForTests: PluginLoader | null = null
let telemetryEmitterOverrideForTests: TelemetryEmitter | null = null

let automaticActionsInitialized = false

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

const handleDeepLink = (rawUrl: string | null | undefined) => {
  return navigateDeepLink(rawUrl)
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
    const shellPlugin = await import('@tauri-apps/plugin-shell')
      .then(({ open }) => ({ open }))
      .catch(() => null)

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
    const deepLinkPlugin = await import('@tauri-apps/plugin-deep-link')
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
    const deepLinkPlugin = await import('@tauri-apps/plugin-deep-link')
    if (typeof deepLinkPlugin.getCurrent !== 'function') return false
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

export const initializeNativeShortcuts = async () => {
  if (pluginLoaderOverrideForTests) {
    await pluginLoaderOverrideForTests('shortcuts')
  }
  return false
}

export const initializeNativeShortcutsWithLabels = async (_labelResolver?: (key: NavLabelKey) => string) => {
  if (pluginLoaderOverrideForTests) {
    await pluginLoaderOverrideForTests('shortcuts')
  }
  return false
}

export const requestNativeReview = async (options: ReviewRequestOptions = {}) => {
  const { flow = 'manual', trigger = 'manual' } = options
  if (!getIsNativeRuntime()) {
    emitFeatureTelemetry('native-review', 'fallback', { flow, trigger, outcome: 'skipped' })
    return false
  }
  emitFeatureTelemetry('native-review', 'fallback', {
    flow,
    trigger,
    outcome: 'unavailable',
    platform: resolveNativePlatform()
  })
  return false
}

export const checkNativeUpdate = async () => {
  if (!getIsNativeRuntime()) return false
  emitFeatureTelemetry('native-update-check', 'fallback', {
    flow: 'manual',
    trigger: 'manual',
    outcome: 'unavailable',
    platform: resolveNativePlatform()
  })
  return false
}

export const initializeNativeAutomaticAppActions = async () => {
  if (!getIsNativeRuntime() || typeof window === 'undefined') return
  if (automaticActionsInitialized) return
  automaticActionsInitialized = true
}

export const runNativeAutomaticAppActionsOnResume = async () => {
  if (!getIsNativeRuntime() || typeof window === 'undefined') return
}

export const disposeNativeAutomaticAppActions = () => {
  automaticActionsInitialized = false
}

export const initializeNativeAppExtras = async (options: NativeExtrasOptions = {}) => {
  const { telemetry = true, labelResolver } = options
  if (!getIsNativeRuntime() || typeof window === 'undefined') return

  try {
    const wasSet = labelResolver ? await initializeNativeShortcutsWithLabels(labelResolver) : await initializeNativeShortcuts()
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
}
