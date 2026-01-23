import { createFragmentClient } from '@core/fragments'
import type { FragmentPayload } from './types'
import { appConfig } from '../app-config'
import { fragmentPlanCache } from './plan-cache'
import { getFragmentCssHref } from './fragment-css'

const client = createFragmentClient(
  {
    getApiBase: () => appConfig.apiBase,
    getWebTransportBase: () => appConfig.webTransportBase,
    isFragmentCompressionPreferred: () => appConfig.preferFragmentCompression,
    isWebTransportDatagramsPreferred: () => appConfig.preferWebTransportDatagrams,
    isWebTransportPreferred: () => appConfig.preferWebTransport
  },
  fragmentPlanCache
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
