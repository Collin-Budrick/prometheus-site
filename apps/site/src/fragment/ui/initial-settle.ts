import type { Lang } from '../../shared/lang-store'
import { normalizeFragmentShellPath } from './shell-cache'

export const INITIAL_TASKS_EVENT = 'prom:fragment-initial-tasks'
const STABLE_HEIGHT_CACHE_PREFIX = 'fragment:stable-height:v1'
const DESKTOP_MIN_WIDTH = 1025

type FragmentInitialTaskEntry = {
  pending: Set<string>
  startedAt: number | null
  settledAt: number | null
  lastErrorAt: number | null
}

export type FragmentInitialStage =
  | 'waiting-payload'
  | 'waiting-css'
  | 'waiting-islands'
  | 'waiting-client-tasks'
  | 'waiting-assets'
  | 'ready'

export type FragmentInitialTaskSnapshot = {
  pendingCount: number
  pendingKeys: string[]
  startedAt: number | null
  settledAt: number | null
  lastErrorAt: number | null
}

export type FragmentStableHeightViewport = 'desktop' | 'mobile'

export type FragmentStableHeightKeyInput = {
  fragmentId: string
  path: string
  lang: Lang | string
  viewport?: FragmentStableHeightViewport
}

const hostTasks = new WeakMap<HTMLElement, FragmentInitialTaskEntry>()
const nodeTaskIds = new WeakMap<object, string>()
let nextNodeTaskId = 1

const createTaskSnapshot = (entry: FragmentInitialTaskEntry): FragmentInitialTaskSnapshot => ({
  pendingCount: entry.pending.size,
  pendingKeys: Array.from(entry.pending),
  startedAt: entry.startedAt,
  settledAt: entry.settledAt,
  lastErrorAt: entry.lastErrorAt
})

const dispatchTaskSnapshot = (host: HTMLElement, entry: FragmentInitialTaskEntry) => {
  host.dataset.initialTaskPending = entry.pending.size > 0 ? 'true' : 'false'
  host.dataset.initialTaskCount = String(entry.pending.size)
  host.dataset.initialTaskKeys = Array.from(entry.pending).join('|')
  host.dispatchEvent(
    new CustomEvent<FragmentInitialTaskSnapshot>(INITIAL_TASKS_EVENT, {
      detail: createTaskSnapshot(entry)
    })
  )
}

const getOrCreateTaskEntry = (host: HTMLElement) => {
  let entry = hostTasks.get(host)
  if (!entry) {
    entry = {
      pending: new Set<string>(),
      startedAt: null,
      settledAt: null,
      lastErrorAt: null
    }
    hostTasks.set(host, entry)
  }
  return entry
}

export const resolveFragmentInitialTaskHost = (node: Element | null | undefined) =>
  node?.closest<HTMLElement>('[data-fragment-id]') ?? null

export const getFragmentInitialTaskKey = (prefix: string, node: object) => {
  const existing = nodeTaskIds.get(node)
  if (existing) return existing
  const key = `${prefix}:${nextNodeTaskId++}`
  nodeTaskIds.set(node, key)
  return key
}

export const beginInitialTask = (host: HTMLElement, key: string) => {
  if (!key.trim()) return
  const entry = getOrCreateTaskEntry(host)
  if (!entry.pending.size && entry.startedAt === null) {
    entry.startedAt = Date.now()
  }
  entry.pending.add(key)
  entry.settledAt = null
  dispatchTaskSnapshot(host, entry)
}

const settleInitialTask = (host: HTMLElement, key: string, errored: boolean) => {
  const entry = getOrCreateTaskEntry(host)
  if (key.trim()) {
    entry.pending.delete(key)
  }
  if (errored) {
    entry.lastErrorAt = Date.now()
  }
  if (!entry.pending.size) {
    entry.settledAt = Date.now()
  }
  dispatchTaskSnapshot(host, entry)
}

export const finishInitialTask = (host: HTMLElement, key: string) => {
  settleInitialTask(host, key, false)
}

export const failInitialTask = (host: HTMLElement, key: string) => {
  settleInitialTask(host, key, true)
}

export const markInitialTasksComplete = (host: HTMLElement) => {
  const entry = getOrCreateTaskEntry(host)
  if (!entry.pending.size) {
    entry.settledAt ??= Date.now()
  }
  dispatchTaskSnapshot(host, entry)
}

export const getInitialTaskSnapshot = (host: HTMLElement | null | undefined): FragmentInitialTaskSnapshot => {
  if (!host) {
    return {
      pendingCount: 0,
      pendingKeys: [],
      startedAt: null,
      settledAt: null,
      lastErrorAt: null
    }
  }
  const entry = getOrCreateTaskEntry(host)
  return createTaskSnapshot(entry)
}

export const readInitialTaskPendingKeys = (host: HTMLElement | null | undefined) =>
  getInitialTaskSnapshot(host).pendingKeys

export const getStableHeightViewport = (width?: number): FragmentStableHeightViewport => {
  const resolvedWidth = typeof width === 'number' && Number.isFinite(width) ? width : window.innerWidth
  return resolvedWidth >= DESKTOP_MIN_WIDTH ? 'desktop' : 'mobile'
}

export const buildFragmentStableHeightKey = ({
  fragmentId,
  path,
  lang,
  viewport
}: FragmentStableHeightKeyInput) =>
  [
    STABLE_HEIGHT_CACHE_PREFIX,
    encodeURIComponent(normalizeFragmentShellPath(path)),
    encodeURIComponent(String(lang)),
    viewport ?? getStableHeightViewport(),
    encodeURIComponent(fragmentId)
  ].join(':')

const normalizeHeight = (value: unknown) => {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseFloat(value)
        : Number.NaN
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.max(1, Math.round(parsed))
}

export const readFragmentStableHeight = (input: FragmentStableHeightKeyInput) => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(buildFragmentStableHeightKey(input))
    return normalizeHeight(raw)
  } catch (error) {
    console.warn('Failed to read fragment stable height cache:', error)
    return null
  }
}

export const writeFragmentStableHeight = (input: FragmentStableHeightKeyInput, height: number) => {
  if (typeof window === 'undefined') return
  const normalized = normalizeHeight(height)
  if (normalized === null) return
  try {
    window.localStorage.setItem(buildFragmentStableHeightKey(input), String(normalized))
  } catch (error) {
    console.warn('Failed to write fragment stable height cache:', error)
  }
}

export const clearFragmentStableHeight = (input: FragmentStableHeightKeyInput) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(buildFragmentStableHeightKey(input))
  } catch (error) {
    console.warn('Failed to clear fragment stable height cache:', error)
  }
}

export const INITIAL_REVEAL_TIMEOUT_MS = 1800

export const shouldForceInitialReveal = (startedAt: number | null, now = Date.now()) => {
  if (startedAt === null) return false
  return now - startedAt >= INITIAL_REVEAL_TIMEOUT_MS
}
