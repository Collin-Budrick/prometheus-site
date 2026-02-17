import { isNativeCapacitorRuntime } from './runtime'
import { loadNativePlugin } from './capacitor-plugin-loader'
import { emitNativeFeatureTelemetry } from './telemetry'
import { type NavLabelKey, authNavItems, enabledNavItems } from '../config'

type ShortcutPayloadItem = {
  id: string
  title: string
  description?: string
  url: string
  icon?: string
}

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
type PluginLoader = (moduleId: string) => Promise<unknown | null>
type TelemetryEmitter = (
  feature: string,
  status: NativeFeatureStatus,
  options?: {
    detail?: Record<string, string>
  }
) => void

type AppUpdateInfo = {
  updateAvailability?: number | string
  immediateUpdateAllowed?: boolean
}

type InAppReviewPluginAdapter = {
  requestReview: () => Promise<void>
}

type AppUpdatePluginAdapter = {
  getAppUpdateInfo: () => Promise<AppUpdateInfo>
  openAppStore: () => Promise<void>
  performImmediateUpdate?: () => Promise<unknown>
}

type ReviewRequestOptions = {
  flow?: NativeFlow
  trigger?: NativeReviewTrigger
  markAttempt?: boolean
}

type UpdateCheckOptions = {
  flow: NativeFlow
  trigger: NativeUpdateTrigger
  throttle: boolean
}

const REVIEW_FIRST_SEEN_KEY = 'prometheus:native-review:first-seen-at'
const REVIEW_LAUNCH_COUNT_KEY = 'prometheus:native-review:launch-count'
const REVIEW_LAST_ATTEMPT_KEY = 'prometheus:native-review:last-attempt-at'
const UPDATE_LAST_CHECK_KEY = 'prometheus:native-update:last-check-at'

const REVIEW_MIN_LAUNCH_COUNT = 5
const REVIEW_MIN_AGE_MS = 7 * 24 * 60 * 60 * 1000
const REVIEW_ATTEMPT_COOLDOWN_MS = 120 * 24 * 60 * 60 * 1000
const UPDATE_CHECK_COOLDOWN_MS = 24 * 60 * 60 * 1000
const UPDATE_AVAILABLE = 2

let nativeRuntimeOverrideForTests: boolean | null = null
let platformOverrideForTests: NativePlatform | null = null
let pluginLoaderOverrideForTests: PluginLoader | null = null
let telemetryEmitterOverrideForTests: TelemetryEmitter | null = null

let automaticActionsInitialized = false
let reviewIntentCleanup: (() => void) | null = null
let updateCheckInFlight: Promise<boolean> | null = null

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
  return isNativeCapacitorRuntime()
}

const loadPlugin = async <T>(moduleId: string): Promise<T | null> => {
  if (pluginLoaderOverrideForTests) {
    return (await pluginLoaderOverrideForTests(moduleId)) as T | null
  }
  return loadNativePlugin<T>(moduleId)
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
  const capacitor = (window as Window & { Capacitor?: { getPlatform?: () => string } }).Capacitor
  const platform = capacitor?.getPlatform?.()
  if (platform === 'android' || platform === 'ios') return platform
  return 'web'
}

const readStorageNumber = (key: string) => {
  if (typeof window === 'undefined') return 0
  try {
    const raw = window.localStorage.getItem(key)
    const parsed = raw ? Number(raw) : 0
    if (!Number.isFinite(parsed) || parsed < 0) return 0
    return Math.floor(parsed)
  } catch {
    return 0
  }
}

const writeStorageNumber = (key: string, value: number) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, String(Math.max(0, Math.floor(value))))
  } catch {
    // no-op
  }
}

const ensureReviewFirstSeen = (now: number) => {
  const existing = readStorageNumber(REVIEW_FIRST_SEEN_KEY)
  if (existing > 0) return existing
  writeStorageNumber(REVIEW_FIRST_SEEN_KEY, now)
  return now
}

const incrementReviewLaunchCount = () => {
  const next = readStorageNumber(REVIEW_LAUNCH_COUNT_KEY) + 1
  writeStorageNumber(REVIEW_LAUNCH_COUNT_KEY, next)
  return next
}

const markReviewAttempt = (at: number) => {
  writeStorageNumber(REVIEW_LAST_ATTEMPT_KEY, at)
}

const wasRecentEnoughToThrottle = (lastAt: number, cooldownMs: number, now: number) => {
  if (!lastAt) return false
  return now - lastAt < cooldownMs
}

const isReviewEligible = (options: { now: number; launchCount: number; firstSeenAt: number; lastAttemptAt: number }) => {
  const { now, launchCount, firstSeenAt, lastAttemptAt } = options
  if (launchCount < REVIEW_MIN_LAUNCH_COUNT) return false
  if (!firstSeenAt || now - firstSeenAt < REVIEW_MIN_AGE_MS) return false
  if (wasRecentEnoughToThrottle(lastAttemptAt, REVIEW_ATTEMPT_COOLDOWN_MS, now)) return false
  return true
}

const isUpdateAvailable = (value: unknown) => {
  if (typeof value === 'number') return value === UPDATE_AVAILABLE
  if (typeof value === 'string') return value === String(UPDATE_AVAILABLE) || value.toUpperCase() === 'UPDATE_AVAILABLE'
  return false
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

const resolveReviewPlugin = async () => {
  const reviewModule = await loadPlugin<Record<string, unknown>>('@capacitor-community/in-app-review')
  if (!reviewModule) return null
  const plugin = normalizePlugin(reviewModule)
  if (!plugin || typeof plugin.requestReview !== 'function') return null
  return {
    requestReview: plugin.requestReview.bind(plugin) as InAppReviewPluginAdapter['requestReview']
  } satisfies InAppReviewPluginAdapter
}

const resolveUpdatePlugin = async () => {
  const updateModule = await loadPlugin<Record<string, unknown>>('@capawesome/capacitor-app-update')
  if (!updateModule) return null
  const plugin = normalizePlugin(updateModule)
  if (!plugin || typeof plugin.getAppUpdateInfo !== 'function' || typeof plugin.openAppStore !== 'function') return null

  const adapter: AppUpdatePluginAdapter = {
    getAppUpdateInfo: plugin.getAppUpdateInfo.bind(plugin) as AppUpdatePluginAdapter['getAppUpdateInfo'],
    openAppStore: plugin.openAppStore.bind(plugin) as AppUpdatePluginAdapter['openAppStore']
  }

  if (typeof plugin.performImmediateUpdate === 'function') {
    adapter.performImmediateUpdate = plugin.performImmediateUpdate.bind(plugin) as NonNullable<
      AppUpdatePluginAdapter['performImmediateUpdate']
    >
  }

  return adapter
}

const removeReviewIntentListeners = () => {
  if (!reviewIntentCleanup) return
  reviewIntentCleanup()
  reviewIntentCleanup = null
}

const maybeArmReviewPrompt = (trigger: Extract<NativeReviewTrigger, 'startup' | 'resume'>) => {
  if (!getIsNativeRuntime() || typeof window === 'undefined') return false

  if (reviewIntentCleanup) {
    emitFeatureTelemetry('native-review', 'success', { flow: 'auto', trigger, outcome: 'armed' })
    return true
  }

  const now = Date.now()
  const firstSeenAt = ensureReviewFirstSeen(now)
  const launchCount = trigger === 'startup' ? incrementReviewLaunchCount() : readStorageNumber(REVIEW_LAUNCH_COUNT_KEY)
  const lastAttemptAt = readStorageNumber(REVIEW_LAST_ATTEMPT_KEY)

  if (!isReviewEligible({ now, launchCount, firstSeenAt, lastAttemptAt })) {
    emitFeatureTelemetry('native-review', 'fallback', { flow: 'auto', trigger, outcome: 'skipped' })
    return false
  }

  const onIntent = () => {
    removeReviewIntentListeners()
    void requestNativeReview({ flow: 'auto', trigger: 'intent', markAttempt: true })
  }

  window.addEventListener('pointerdown', onIntent, { once: true, passive: true })
  window.addEventListener('keydown', onIntent, { once: true })
  window.addEventListener('touchstart', onIntent, { once: true, passive: true })

  reviewIntentCleanup = () => {
    window.removeEventListener('pointerdown', onIntent)
    window.removeEventListener('keydown', onIntent)
    window.removeEventListener('touchstart', onIntent)
  }

  emitFeatureTelemetry('native-review', 'success', { flow: 'auto', trigger, outcome: 'armed' })
  return true
}

const performNativeUpdateCheck = async (options: UpdateCheckOptions) => {
  const { flow, trigger, throttle } = options

  if (!getIsNativeRuntime()) {
    emitFeatureTelemetry('native-update-check', 'fallback', { flow, trigger, outcome: 'skipped' })
    return false
  }

  const now = Date.now()
  const lastCheckAt = readStorageNumber(UPDATE_LAST_CHECK_KEY)
  if (throttle && wasRecentEnoughToThrottle(lastCheckAt, UPDATE_CHECK_COOLDOWN_MS, now)) {
    emitFeatureTelemetry('native-update-check', 'fallback', { flow, trigger, outcome: 'throttled' })
    return false
  }

  if (throttle) {
    writeStorageNumber(UPDATE_LAST_CHECK_KEY, now)
  }

  const plugin = await resolveUpdatePlugin()
  if (!plugin) {
    emitFeatureTelemetry('native-update-check', 'fallback', { flow, trigger, outcome: 'skipped' })
    return false
  }

  const platform = resolveNativePlatform()

  try {
    const info = (await plugin.getAppUpdateInfo()) as AppUpdateInfo
    if (!isUpdateAvailable(info?.updateAvailability)) {
      emitFeatureTelemetry('native-update-check', 'success', { flow, trigger, outcome: 'no-update', platform })
      return true
    }

    if (platform === 'android' && info?.immediateUpdateAllowed && typeof plugin.performImmediateUpdate === 'function') {
      try {
        await plugin.performImmediateUpdate()
        emitFeatureTelemetry('native-update-check', 'success', { flow, trigger, outcome: 'immediate', platform })
        return true
      } catch {
        // fallback to app store
      }
    }

    await plugin.openAppStore()
    emitFeatureTelemetry('native-update-check', 'success', { flow, trigger, outcome: 'store', platform })
    return true
  } catch {
    emitFeatureTelemetry('native-update-check', 'error', { flow, trigger, outcome: 'error', platform })
    return false
  }
}

const runNativeUpdateCheckWithLock = async (options: UpdateCheckOptions) => {
  if (updateCheckInFlight) {
    return updateCheckInFlight
  }

  const pending = performNativeUpdateCheck(options).finally(() => {
    if (updateCheckInFlight === pending) {
      updateCheckInFlight = null
    }
  })

  updateCheckInFlight = pending
  return pending
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

  if (!getIsNativeRuntime()) {
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(parsed.toString(), '_blank', 'noopener,noreferrer')
      return { attempted: true, handled: false }
    }
    return { attempted: false, handled: false }
  }

  const browserPlugin = normalizePlugin(await loadPlugin<Record<string, unknown>>('@capacitor/browser'))
  if (browserPlugin && (typeof browserPlugin.open === 'function' || typeof browserPlugin.openInSystemBrowser === 'function')) {
    try {
      await tryBrowserOpen(browserPlugin, parsed.toString())
      return { attempted: true, handled: true }
    } catch {
      // fallback below
    }
  }

  const inAppBrowserPlugin = normalizePlugin(await loadPlugin<Record<string, unknown>>('@capacitor/inappbrowser'))
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

const defaultLabelResolver: Record<NavLabelKey, string> = {
  navHome: 'Home',
  navStore: 'Store',
  navLab: 'Lab',
  navLogin: 'Login',
  navProfile: 'Profile',
  navChat: 'Chat',
  navSettings: 'Settings',
  navDashboard: 'Dashboard'
}

const resolveShortcutLabel = (labelKey: NavLabelKey, labelResolver?: NativeExtrasOptions['labelResolver']) =>
  labelResolver?.(labelKey) ?? defaultLabelResolver[labelKey]

const buildQuickShortcutPayload = (labelResolver?: NativeExtrasOptions['labelResolver']): { items: ShortcutPayloadItem[] } => {
  if (typeof window === 'undefined') return { items: [] }
  const origin = window.location.origin
  const items = [...enabledNavItems, ...authNavItems]
    .filter((item, index, array) => index === array.findIndex((entry) => entry.href === item.href))
    .map((item): ShortcutPayloadItem | null => {
      const title = resolveShortcutLabel(item.labelKey, labelResolver)
      const url = `${origin}${item.href === '/' ? '' : item.href}`
      return {
        id: item.href.replace(/\//g, '_') || 'home',
        title,
        description: `Open ${title}`,
        url
      }
    })
    .filter((item): item is ShortcutPayloadItem => item !== null)
  return {
    items
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
  if (!getIsNativeRuntime() || typeof window === 'undefined') return false

  const shortcutModule = await loadPlugin<unknown>('@capawesome/capacitor-app-shortcuts')
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

export const initializeNativeShortcutsWithLabels = async (labelResolver?: (key: NavLabelKey) => string) => {
  if (!getIsNativeRuntime() || typeof window === 'undefined') return false
  const shortcutModule = await loadPlugin<unknown>('@capawesome/capacitor-app-shortcuts')
  if (!shortcutModule) return false

  const plugin = normalizePlugin(shortcutModule)
  if (!plugin) return false

  const payload = buildQuickShortcutPayload(labelResolver)
  try {
    return await invokeShortcutSetter(plugin, payload)
  } catch {
    return false
  }
}

export const requestNativeReview = async (options: ReviewRequestOptions = {}) => {
  const { flow = 'manual', trigger = 'manual', markAttempt = false } = options
  if (!getIsNativeRuntime()) {
    emitFeatureTelemetry('native-review', 'fallback', { flow, trigger, outcome: 'skipped' })
    return false
  }

  if (markAttempt) {
    markReviewAttempt(Date.now())
  }

  const plugin = await resolveReviewPlugin()
  if (!plugin) {
    emitFeatureTelemetry('native-review', 'fallback', { flow, trigger, outcome: 'skipped' })
    return false
  }

  try {
    await plugin.requestReview()
    emitFeatureTelemetry('native-review', 'success', { flow, trigger, outcome: 'requested' })
    return true
  } catch {
    emitFeatureTelemetry('native-review', 'error', { flow, trigger, outcome: 'error' })
    return false
  }
}

export const checkNativeUpdate = async () => {
  if (!getIsNativeRuntime()) return false
  return runNativeUpdateCheckWithLock({ flow: 'manual', trigger: 'manual', throttle: false })
}

export const initializeNativeAutomaticAppActions = async () => {
  if (!getIsNativeRuntime() || typeof window === 'undefined') return
  if (automaticActionsInitialized) return
  automaticActionsInitialized = true

  maybeArmReviewPrompt('startup')
  await runNativeUpdateCheckWithLock({ flow: 'auto', trigger: 'startup', throttle: true })
}

export const runNativeAutomaticAppActionsOnResume = async () => {
  if (!getIsNativeRuntime() || typeof window === 'undefined') return
  maybeArmReviewPrompt('resume')
  await runNativeUpdateCheckWithLock({ flow: 'auto', trigger: 'resume', throttle: true })
}

export const disposeNativeAutomaticAppActions = () => {
  automaticActionsInitialized = false
  removeReviewIntentListeners()
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
  removeReviewIntentListeners()
  updateCheckInFlight = null
}
