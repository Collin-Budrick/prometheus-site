import type { SpeculationRulesProps } from 'speculation-rules'

import type { EnvConfig } from '../fragment/config'
import { getApiBase } from '../fragment/config'
import type { FragmentPayloadMap, FragmentPlan } from '../fragment/types'

type PrefetchNode = { href?: string; parentNode?: Node | null }

type PrefetchDocument = {
  querySelectorAll: (selectors: string) => ArrayLike<PrefetchNode>
}

type ScriptDocument = PrefetchDocument & {
  createElement: (tagName: string) => HTMLScriptElement
  head: { appendChild: (node: HTMLScriptElement) => void }
}

const SPECULATION_SELECTOR = 'script[type="speculationrules"][data-fragment-speculation="fragments"]'

const toOrigin = (origin?: string) => {
  if (origin) return origin
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return ''
}

const toAbsoluteApiBase = (apiBase: string, origin: string) => {
  if (apiBase.startsWith('http://') || apiBase.startsWith('https://')) {
    return apiBase
  }
  return `${origin}${apiBase}`
}

const isSameOrigin = (href: string, origin: string) => {
  try {
    return new URL(href, origin).origin === origin
  } catch {
    return false
  }
}

const collectPrefetchedHrefs = (documentRef: PrefetchDocument | null | undefined, origin: string) => {
  // Quicklink uses <link rel="prefetch"> for fragment-aware anchors; skip those to avoid duplicate work.
  const prefetched = new Set<string>()
  if (!documentRef?.querySelectorAll) return prefetched

  Array.from(documentRef.querySelectorAll('link[rel~="prefetch"]')).forEach((link) => {
    const href = (link as { href?: string }).href
    if (!href) return
    try {
      prefetched.add(new URL(href, origin).href)
    } catch {
      // ignore invalid URLs
    }
  })

  return prefetched
}

const normalizeUrls = (
  urls: Iterable<string>,
  origin: string,
  documentRef: PrefetchDocument | null | undefined
) => {
  const seen = new Set<string>()
  const prefetched = collectPrefetchedHrefs(documentRef, origin)
  const normalized: string[] = []

  for (const href of urls) {
    let absolute: string
    try {
      absolute = new URL(href, origin).href
    } catch {
      continue
    }
    if (!isSameOrigin(absolute, origin)) continue
    if (prefetched.has(absolute)) continue
    if (seen.has(absolute)) continue
    seen.add(absolute)
    normalized.push(absolute)
  }

  return normalized
}

const joinApiPath = (apiBase: string, path: string) => `${apiBase}${path.startsWith('/') ? path : `/${path}`}`

export const buildSpeculationRulesForPlan = (
  plan: FragmentPlan,
  env: EnvConfig,
  options?: {
    knownFragments?: FragmentPayloadMap | null
    origin?: string
    documentRef?: PrefetchDocument | null
  }
): SpeculationRulesProps | null => {
  const origin = toOrigin(options?.origin)
  if (!origin) return null

  const apiBase = getApiBase(env)
  if (!apiBase) return null

  const absoluteApiBase = toAbsoluteApiBase(apiBase, origin)
  if (!isSameOrigin(absoluteApiBase, origin)) return null

  const urls = new Set<string>()
  const encodedPath = encodeURIComponent(plan.path || '/')

  urls.add(joinApiPath(absoluteApiBase, `/fragments/plan?path=${encodedPath}`))
  urls.add(joinApiPath(absoluteApiBase, `/fragments/stream?path=${encodedPath}`))

  const knownIds = new Set(Object.keys(options?.knownFragments ?? {}))
  plan.fragments.forEach(({ id }) => {
    if (knownIds.has(id)) return
    urls.add(joinApiPath(absoluteApiBase, `/fragments?id=${encodeURIComponent(id)}`))
  })

  const normalized = normalizeUrls(urls, origin, options?.documentRef)
  if (!normalized.length) return null

  return {
    prerenderRules: [],
    prefetchRules: [
      {
        source: 'list',
        urls: normalized
      }
    ]
  }
}

export const applySpeculationRules = (
  rules: SpeculationRulesProps | null,
  documentRef: ScriptDocument | null = typeof document !== 'undefined' ? (document as ScriptDocument) : null
) => {
  if (!documentRef) return () => {}

  Array.from(documentRef.querySelectorAll(SPECULATION_SELECTOR)).forEach((node) => {
    node.parentNode?.removeChild(node as unknown as Node)
  })

  if (
    !rules ||
    ((!rules.prefetchRules || !rules.prefetchRules.length) && (!rules.prerenderRules || !rules.prerenderRules.length))
  ) {
    return () => {}
  }

  const script = documentRef.createElement('script')
  script.type = 'speculationrules'
  script.setAttribute('data-fragment-speculation', 'fragments')
  script.textContent = JSON.stringify({
    prerender: rules.prerenderRules ?? [],
    prefetch: rules.prefetchRules ?? []
  })

  documentRef.head.appendChild(script)

  return () => {
    script.parentNode?.removeChild(script)
  }
}
