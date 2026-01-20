import type { FragmentPayloadMap, FragmentPlanValue } from '../types'
import type { Lang } from '../../shared/lang-store'

export type FieldSnapshot = {
  key: string
  value?: string
  checked?: boolean
}

export type FragmentShellState = {
  path: string
  orderIds: string[]
  expandedId: string | null
  scrollY: number
}

export type FragmentShellCacheEntry = {
  plan: FragmentPlanValue
  path: string
  lang: Lang
  fragments: FragmentPayloadMap
  orderIds: string[]
  expandedId: string | null
  scrollY: number
  fields: Record<string, FieldSnapshot>
}

const fragmentShellCache = new Map<string, FragmentShellCacheEntry>()
const SHELL_COOKIE_KEY = 'prom-shell'

const normalizeFragmentShellPath = (value: string) => value.replace(/\/+$/, '') || '/'

export const getFragmentShellCacheEntry = (path: string) =>
  fragmentShellCache.get(normalizeFragmentShellPath(path))

export const setFragmentShellCacheEntry = (path: string, entry: FragmentShellCacheEntry) => {
  fragmentShellCache.set(normalizeFragmentShellPath(path), entry)
}

const readCookieValue = (cookieHeader: string | null, key: string) => {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const [name, raw] = part.trim().split('=')
    if (name === key) {
      if (!raw) return ''
      try {
        return decodeURIComponent(raw)
      } catch {
        return null
      }
    }
  }
  return null
}

const normalizeOrderIds = (value: unknown) => {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry): entry is string => entry.length > 0)
    .slice(0, 120)
}

export const readFragmentShellStateFromCookie = (cookieHeader: string | null, path: string): FragmentShellState | null => {
  const raw = readCookieValue(cookieHeader, SHELL_COOKIE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return null
    const parsedPath = typeof parsed.path === 'string' ? normalizeFragmentShellPath(parsed.path) : ''
    const expectedPath = normalizeFragmentShellPath(path)
    if (!parsedPath || parsedPath !== expectedPath) return null
    const orderIds = normalizeOrderIds(parsed.orderIds)
    const expandedId = typeof parsed.expandedId === 'string' ? parsed.expandedId : null
    const scrollY =
      typeof parsed.scrollY === 'number' && Number.isFinite(parsed.scrollY) ? Math.max(0, parsed.scrollY) : 0
    return { path: parsedPath, orderIds, expandedId, scrollY }
  } catch {
    return null
  }
}

export const writeFragmentShellStateToCookie = (state: FragmentShellState) => {
  if (typeof document === 'undefined') return
  const payload: FragmentShellState = {
    path: normalizeFragmentShellPath(state.path),
    orderIds: normalizeOrderIds(state.orderIds),
    expandedId: typeof state.expandedId === 'string' ? state.expandedId : null,
    scrollY: Number.isFinite(state.scrollY) ? Math.max(0, Math.floor(state.scrollY)) : 0
  }
  try {
    const serialized = encodeURIComponent(JSON.stringify(payload))
    document.cookie = `${SHELL_COOKIE_KEY}=${serialized}; path=/; max-age=3600; samesite=lax`
  } catch {
    // ignore cookie failures
  }
}

export { normalizeFragmentShellPath }
