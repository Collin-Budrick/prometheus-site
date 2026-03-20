import { decodeFragmentPayload, type FragmentPayloadMap, type FragmentPlan } from '@core/fragments'
import { appConfig } from '../public-app-config'
import { fragmentPlanCache } from '../fragment/plan-cache'
import { isNativeShellRuntime } from './runtime'

type RunnerDispatchOverride = (event: string, details: Record<string, unknown>) => Promise<unknown | null>

export type BackgroundStoreQueueAction = {
  type: 'consume' | 'restore'
  id: number
  amount?: number
  queuedAt: string
}

export type BackgroundStoreSyncResult = {
  processed: number
  remaining: number
}

export type BackgroundPrefetchConfigureOptions = {
  origin: string
  apiBase?: string
  lang: string
  isAuthenticated: boolean
  publicRoutes?: string[]
  authRoutes?: string[]
  fragmentRoutes?: string[]
}

export type BackgroundPrefetchExportEntry = {
  path: string
  lang: string
  fetchedAt: number
  etag?: string
  payloadText: string
}

export type BackgroundPrefetchConfigPayload = {
  origin: string
  apiBase: string
  lang: string
  isAuthenticated: boolean
  publicRoutes: string[]
  authRoutes: string[]
  fragmentRoutes: string[]
  activeRoutes: string[]
}

export const BACKGROUND_RUNNER_LABEL = 'dev.prometheus.site.background.task'
export const backgroundPrefetchPublicRoutes = ['/', '/store', '/lab', '/login', '/offline'] as const
export const backgroundPrefetchAuthRoutes = ['/chat', '/profile', '/settings', '/dashboard'] as const
export const backgroundPrefetchFragmentRoutes = ['/', '/store', '/lab', '/login', '/chat'] as const

let dispatchOverride: RunnerDispatchOverride | null = null
let nativeRuntimeOverride: boolean | null = null

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const normalizePath = (value: unknown) => {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed === '/') return '/'
  const prefixed = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return prefixed.replace(/\/{2,}/g, '/')
}

const normalizePaths = (values: readonly string[]) => {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const value of values) {
    const path = normalizePath(value)
    if (!path || seen.has(path)) continue
    seen.add(path)
    normalized.push(path)
  }
  return normalized
}

const normalizeApiBase = (origin: string, apiBase: string) => {
  const normalizedOrigin = origin.trim().replace(/\/+$/, '')
  const value = apiBase.trim()
  if (!value) return normalizedOrigin
  if (value.startsWith('http://') || value.startsWith('https://')) return value.replace(/\/+$/, '')
  if (value.startsWith('/')) return `${normalizedOrigin}${value}`.replace(/\/+$/, '')
  return `${normalizedOrigin}/${value}`.replace(/\/+$/, '')
}

const isNativeRuntime = () => {
  if (nativeRuntimeOverride !== null) return nativeRuntimeOverride
  return isNativeShellRuntime()
}

const dispatchRunnerEvent = async <T = unknown>(event: string, details: Record<string, unknown> = {}) => {
  if (dispatchOverride) {
    return (await dispatchOverride(event, details)) as T | null
  }
  if (!isNativeRuntime()) return null
  return null
}

const normalizeQueueAction = (value: unknown): BackgroundStoreQueueAction | null => {
  if (!isRecord(value)) return null
  const type = value.type === 'restore' ? 'restore' : value.type === 'consume' ? 'consume' : null
  const id = Number(value.id)
  const queuedAt = typeof value.queuedAt === 'string' ? value.queuedAt : ''
  const amount = Number(value.amount)
  if (!type || !Number.isFinite(id) || id <= 0 || !queuedAt) return null
  if (type === 'restore') {
    if (!Number.isFinite(amount) || amount <= 0) return null
    return { type, id: Math.trunc(id), amount: Math.trunc(amount), queuedAt }
  }
  return { type, id: Math.trunc(id), queuedAt }
}

const parseQueueResult = (value: unknown) => {
  if (!isRecord(value) || !Array.isArray(value.queue)) return null
  return value.queue
    .map((entry) => normalizeQueueAction(entry))
    .filter((entry): entry is BackgroundStoreQueueAction => entry !== null)
}

const parseStoreSyncResult = (value: unknown): BackgroundStoreSyncResult | null => {
  if (!isRecord(value)) return null
  const processed = Number(value.processed)
  const remaining = Number(value.remaining)
  if (!Number.isFinite(processed) || !Number.isFinite(remaining)) return null
  return {
    processed: Math.max(0, Math.trunc(processed)),
    remaining: Math.max(0, Math.trunc(remaining))
  }
}

const parsePrefetchExportEntries = (value: unknown): BackgroundPrefetchExportEntry[] | null => {
  if (!isRecord(value) || !Array.isArray(value.entries)) return null
  const entries: BackgroundPrefetchExportEntry[] = []
  for (const entry of value.entries) {
    if (!isRecord(entry)) continue
    const path = normalizePath(entry.path)
    const lang = typeof entry.lang === 'string' ? entry.lang : ''
    const payloadText = typeof entry.payloadText === 'string' ? entry.payloadText : ''
    const fetchedAt = Number(entry.fetchedAt)
    const etag = typeof entry.etag === 'string' ? entry.etag : undefined
    if (!path || !lang || !payloadText || !Number.isFinite(fetchedAt)) continue
    entries.push({
      path,
      lang,
      payloadText,
      fetchedAt: Math.trunc(fetchedAt),
      ...(etag ? { etag } : {})
    })
  }
  return entries
}

const decodeBase64 = (value: string) => {
  if (typeof atob === 'function') {
    const decoded = atob(value)
    const bytes = new Uint8Array(decoded.length)
    for (let index = 0; index < decoded.length; index += 1) {
      bytes[index] = decoded.charCodeAt(index)
    }
    return bytes
  }
  const globalBuffer = (globalThis as { Buffer?: { from: (value: string, encoding: string) => Uint8Array } }).Buffer
  if (globalBuffer && typeof globalBuffer.from === 'function') {
    return new Uint8Array(globalBuffer.from(value, 'base64'))
  }
  return null
}

const parsePrefetchPlanPayload = (value: unknown) => {
  if (!isRecord(value)) return null
  if (!Array.isArray(value.fragments) || typeof value.path !== 'string') return null
  const payload = { ...value }
  const initialRaw = isRecord(payload.initialFragments) ? payload.initialFragments : {}
  const initialFragments: FragmentPayloadMap = {}

  for (const [id, encoded] of Object.entries(initialRaw)) {
    if (typeof encoded !== 'string' || !id) continue
    const bytes = decodeBase64(encoded)
    if (!bytes) continue
    try {
      const fragment = decodeFragmentPayload(bytes)
      initialFragments[id] = { ...fragment, id }
    } catch {
      // ignore invalid fragment payloads during hydration
    }
  }

  delete payload.initialFragments
  const plan = payload as FragmentPlan
  if (typeof plan.createdAt !== 'number') {
    plan.createdAt = Date.now()
  }
  return { plan, initialFragments }
}

export const getBackgroundStoreQueue = async () => {
  const result = await dispatchRunnerEvent('store-cart-queue:get', {})
  return parseQueueResult(result)
}

export const setBackgroundStoreQueue = async (queue: BackgroundStoreQueueAction[]) => {
  const normalized = queue
    .map((entry) => normalizeQueueAction(entry))
    .filter((entry): entry is BackgroundStoreQueueAction => entry !== null)
  const result = await dispatchRunnerEvent('store-cart-queue:set', { queue: normalized })
  if (isRecord(result) && typeof result.size === 'number') return true
  return false
}

export const configureBackgroundStoreSync = async (options: { origin: string; apiBase?: string }) => {
  const origin = options.origin.trim().replace(/\/+$/, '')
  if (!origin) return false
  const apiBase = normalizeApiBase(origin, options.apiBase ?? appConfig.apiBase)
  const result = await dispatchRunnerEvent('store-cart-config:set', { origin, apiBase })
  if (isRecord(result) && result.ok === true) return true
  return false
}

export const syncBackgroundStoreQueue = async (options: {
  origin: string
  reason?: string
  apiBase?: string
}) => {
  const configured = await configureBackgroundStoreSync(options)
  if (!configured) return null
  const result = await dispatchRunnerEvent('store-cart-sync', { reason: options.reason ?? 'manual' })
  return parseStoreSyncResult(result)
}

export const configureBackgroundPrefetch = async (options: BackgroundPrefetchConfigureOptions) => {
  const payload = buildBackgroundPrefetchConfigPayload(options)
  if (!payload) return false
  const result = await dispatchRunnerEvent('prefetch:configure', payload)
  return Boolean(isRecord(result) && result.ok === true)
}

export const buildBackgroundPrefetchConfigPayload = (
  options: BackgroundPrefetchConfigureOptions
): BackgroundPrefetchConfigPayload | null => {
  const origin = options.origin.trim().replace(/\/+$/, '')
  if (!origin) return null
  const apiBase = normalizeApiBase(origin, options.apiBase ?? appConfig.apiBase)
  const publicRoutes = normalizePaths(options.publicRoutes ?? Array.from(backgroundPrefetchPublicRoutes))
  const authRoutes = normalizePaths(options.authRoutes ?? Array.from(backgroundPrefetchAuthRoutes))
  const payload: BackgroundPrefetchConfigPayload = {
    origin,
    apiBase,
    lang: options.lang || 'en',
    isAuthenticated: options.isAuthenticated,
    publicRoutes,
    authRoutes,
    fragmentRoutes: normalizePaths(options.fragmentRoutes ?? Array.from(backgroundPrefetchFragmentRoutes)),
    activeRoutes: options.isAuthenticated ? normalizePaths([...publicRoutes, ...authRoutes]) : publicRoutes
  }
  return payload
}

export const runBackgroundPrefetchNow = async (reason = 'manual') => {
  const result = await dispatchRunnerEvent('prefetch:run-now', { reason })
  if (!isRecord(result)) return null
  return {
    warmed: Number.isFinite(Number(result.warmed)) ? Math.max(0, Math.trunc(Number(result.warmed))) : 0,
    planned: Number.isFinite(Number(result.planned)) ? Math.max(0, Math.trunc(Number(result.planned))) : 0,
    cached: Number.isFinite(Number(result.cached)) ? Math.max(0, Math.trunc(Number(result.cached))) : 0,
    documentsCached: Number.isFinite(Number(result.documentsCached))
      ? Math.max(0, Math.trunc(Number(result.documentsCached)))
      : 0
  }
}

export const exportBackgroundPrefetchCache = async () => {
  const result = await dispatchRunnerEvent('prefetch:export', {})
  return parsePrefetchExportEntries(result)
}

export const hydrateBackgroundPrefetchCache = async () => {
  const entries = await exportBackgroundPrefetchCache()
  if (!entries?.length) return { hydrated: 0, skipped: 0 }

  let hydrated = 0
  let skipped = 0

  for (const entry of entries) {
    const parsed = parsePrefetchPlanPayload(parseJson(entry.payloadText))
    if (!parsed) {
      skipped += 1
      continue
    }
    try {
      fragmentPlanCache.set(entry.path, entry.lang, {
        etag: entry.etag ?? '',
        plan: parsed.plan,
        initialFragments: parsed.initialFragments
      })
      hydrated += 1
    } catch {
      skipped += 1
    }
  }

  return { hydrated, skipped }
}

const parseJson = (raw: string) => {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export const setBackgroundRunnerDispatchOverrideForTests = (override: RunnerDispatchOverride | null) => {
  dispatchOverride = override
}

export const setBackgroundRunnerNativeRuntimeOverrideForTests = (value: boolean | null) => {
  nativeRuntimeOverride = value
}

export const resetBackgroundRunnerForTests = () => {
  dispatchOverride = null
  nativeRuntimeOverride = null
}
