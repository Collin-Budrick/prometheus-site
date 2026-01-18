import type { FragmentPayloadMap, FragmentPlanValue } from '../types'
import type { Lang } from '../../shared/lang-store'

export type FieldSnapshot = {
  key: string
  value?: string
  checked?: boolean
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

const normalizeFragmentShellPath = (value: string) => value.replace(/\/+$/, '') || '/'

export const getFragmentShellCacheEntry = (path: string) =>
  fragmentShellCache.get(normalizeFragmentShellPath(path))

export const setFragmentShellCacheEntry = (path: string, entry: FragmentShellCacheEntry) => {
  fragmentShellCache.set(normalizeFragmentShellPath(path), entry)
}

export { normalizeFragmentShellPath }
