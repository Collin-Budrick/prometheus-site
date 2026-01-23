import type { FragmentPlanValue } from './types'
import { fragmentCssManifest } from './fragment-css.generated'

type FragmentCssLink = {
  rel: 'stylesheet'
  href: string
  'data-fragment-css': string
}

const env = (import.meta as ImportMeta & { env?: { DEV?: boolean; BASE_URL?: string } }).env ?? {}
const isDev = Boolean(env.DEV)

const normalizeBase = (base: string) => (base.endsWith('/') ? base : `${base}/`)
const normalizePath = (path: string) => path.replace(/^\/+/, '')

export const getFragmentCssHref = (id: string) => {
  if (isDev) return null
  const entry = fragmentCssManifest[id]
  if (!entry) return null
  const base = normalizeBase(typeof env.BASE_URL === 'string' ? env.BASE_URL : '/')
  return `${base}${normalizePath(entry.path)}`
}

export const buildFragmentCssLinks = (
  plan?: FragmentPlanValue | null,
  options: { criticalOnly?: boolean } = {}
) => {
  if (isDev || !plan?.fragments?.length) return []
  const { criticalOnly = false } = options
  const grouped = new Map<string, Set<string>>()
  plan.fragments.forEach((entry) => {
    if (criticalOnly && !entry.critical) return
    const href = getFragmentCssHref(entry.id)
    if (!href) return
    const ids = grouped.get(href) ?? new Set<string>()
    ids.add(entry.id)
    grouped.set(href, ids)
  })
  const links: FragmentCssLink[] = []
  grouped.forEach((ids, href) => {
    links.push({ rel: 'stylesheet', href, 'data-fragment-css': Array.from(ids).join(' ') })
  })
  return links
}
