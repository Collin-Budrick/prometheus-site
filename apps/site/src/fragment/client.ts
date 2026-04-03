import { createFragmentClient } from '@core/fragment/client'
import type { FragmentPayload } from './types'
import { fragmentPlanCache } from './plan-cache'
import { resolveCurrentFragmentCacheScope } from './cache-scope'
import { getFragmentCssHref } from './fragment-css'
import { asTrustedScriptUrl, getCspNonce } from '../security/client'
import {
  getPublicFragmentApiBase,
  getPublicWebTransportBase,
  isPublicFragmentCompressionPreferred,
  isPublicWebTransportDatagramsPreferred,
  isPublicWebTransportPreferred
} from '../shared/public-fragment-config'

const scopedFragmentPlanCache = {
  get: (path: string, lang?: string) =>
    fragmentPlanCache.get(path, lang, { scopeKey: resolveCurrentFragmentCacheScope(path) }),
  set: (path: string, lang: string | undefined, entry: Parameters<typeof fragmentPlanCache.set>[2]) =>
    fragmentPlanCache.set(path, lang, entry, { scopeKey: resolveCurrentFragmentCacheScope(path) })
}

const client = createFragmentClient(
  {
    getApiBase: getPublicFragmentApiBase,
    getCspNonce,
    transformWorkerScriptUrl: asTrustedScriptUrl,
    getWebTransportBase: getPublicWebTransportBase,
    getFragmentProtocol: () => 2,
    isFragmentCompressionPreferred: isPublicFragmentCompressionPreferred,
    isDecodeWorkerPreferred: () => false,
    isWebTransportDatagramsPreferred: isPublicWebTransportDatagramsPreferred,
    isWebTransportPreferred: isPublicWebTransportPreferred
  },
  scopedFragmentPlanCache
)

const ensureFragmentStylesheet = (id: string) => {
  if (typeof document === 'undefined') return
  const href = getFragmentCssHref(id)
  if (!href) return
  const existing = document.querySelector(`link[data-fragment-css~="${id}"]`)
  if (existing) return
  const byHref = Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"], link[rel="preload"]')
  ).find((link) => link.getAttribute('href') === href)
  if (byHref) {
    const current = byHref.dataset.fragmentCss?.split(/\s+/).filter(Boolean) ?? []
    if (!current.includes(id)) {
      byHref.dataset.fragmentCss = [...current, id].join(' ')
    }
    return
  }
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  link.dataset.fragmentCss = id
  document.head.appendChild(link)
}

export const applyFragmentEffects = (payload: FragmentPayload) => {
  const href = getFragmentCssHref(payload.id)
  if (href) {
    ensureFragmentStylesheet(payload.id)
    client.applyFragmentEffects({ ...payload, css: '' })
    return
  }
  client.applyFragmentEffects(payload)
}

export const {
  teardownFragmentEffects,
  fetchFragmentPlan,
  fetchFragment,
  fetchFragmentBatch,
  streamFragments
} = client
