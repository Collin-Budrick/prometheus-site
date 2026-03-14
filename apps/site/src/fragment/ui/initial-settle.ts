import type { Lang } from '../../shared/lang-store'
import { normalizeFragmentShellPath } from './shell-cache'
import {
  buildFragmentStableHeightKey as buildFragmentStableHeightKeyValue,
  clearFragmentStableHeight as clearFragmentStableHeightValue,
  getFragmentHeightViewport as getStableHeightViewportValue,
  readFragmentStableHeight as readFragmentStableHeightValue,
  writeFragmentStableHeight as writeFragmentStableHeightValue,
  type FragmentHeightViewport
} from '@prometheus/ui/fragment-height'

export const INITIAL_TASKS_EVENT = 'prom:fragment-initial-tasks'

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

export type FragmentStableHeightViewport = FragmentHeightViewport

export type FragmentStableHeightKeyInput = {
  fragmentId: string
  path: string
  lang: Lang | string
  viewport?: FragmentStableHeightViewport
  planSignature?: string | null
  versionSignature?: string | null
  widthBucket?: string | null
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

export const getStableHeightViewport = (width?: number): FragmentStableHeightViewport =>
  getStableHeightViewportValue(width)

export const buildFragmentStableHeightKey = ({
  fragmentId,
  path,
  lang,
  viewport,
  planSignature,
  versionSignature,
  widthBucket
}: FragmentStableHeightKeyInput) =>
  buildFragmentStableHeightKeyValue({
    fragmentId,
    path: normalizeFragmentShellPath(path),
    lang: String(lang),
    viewport,
    planSignature,
    versionSignature,
    widthBucket
  })

export const readFragmentStableHeight = (input: FragmentStableHeightKeyInput) => {
  try {
    return readFragmentStableHeightValue(input)
  } catch (error) {
    console.warn('Failed to read fragment stable height cache:', error)
    return null
  }
}

export const writeFragmentStableHeight = (input: FragmentStableHeightKeyInput, height: number) => {
  try {
    writeFragmentStableHeightValue(input, height)
  } catch (error) {
    console.warn('Failed to write fragment stable height cache:', error)
  }
}

export const clearFragmentStableHeight = (input: FragmentStableHeightKeyInput) => {
  try {
    clearFragmentStableHeightValue(input)
  } catch (error) {
    console.warn('Failed to clear fragment stable height cache:', error)
  }
}

export const INITIAL_REVEAL_TIMEOUT_MS = 1800

export const shouldForceInitialReveal = (startedAt: number | null, now = Date.now()) => {
  if (startedAt === null) return false
  return now - startedAt >= INITIAL_REVEAL_TIMEOUT_MS
}
