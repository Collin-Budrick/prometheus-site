import { component$, useContextProvider } from '@builder.io/qwik'
import { routeLoader$, useLocation, type DocumentHead, type DocumentHeadProps, type RequestHandler } from '@builder.io/qwik-city'
import { StaticRouteSkeleton, StaticRouteTemplate } from '@prometheus/ui'
import { siteBrand, siteFeatures } from '../../config'
import { useLangCopy } from '../../shared/lang-bridge'
import { getUiCopy } from '../../shared/ui-copy'
import { createCacheHandler, PUBLIC_SWR_CACHE } from '../cache-headers'
import { resolveRequestOrigin, resolveServerApiBase } from '../../shared/api-base'
import {
  FragmentShell,
  getFragmentShellCacheEntry,
  readFragmentShellStateFromCookie,
  type FragmentShellState
} from '../../fragment/ui'
import type { FragmentPayload, FragmentPayloadValue, FragmentPlan, FragmentPlanValue, RenderNode } from '../../fragment/types'
import { appConfig } from '../../app-config'
import { loadHybridFragmentResource, resolveRequestLang } from '../fragment-resource'
import { defaultLang, type Lang } from '../../shared/lang-store'
import { readStoreCartQueueFromCookie, readStoreCartSnapshotFromCookie } from '../../shared/store-cart'
import { StoreSeedContext, type StoreSeed } from '../../shared/store-seed'

const featureStoreModule = await import('@features/store/pages/Store')
const { StoreRoute: FeatureStoreRoute, StoreSkeleton: FeatureStoreSkeleton } = featureStoreModule

const storeEnabled = siteFeatures.store !== false
type FragmentResource = {
  plan: FragmentPlanValue
  fragments: FragmentPayloadValue
  path: string
  lang: Lang
  shellState: FragmentShellState | null
  storeSeed: StoreSeed
}

const textNode = (text: string): RenderNode => ({ type: 'text', text })

const elementNode = (tag: string, attrs?: Record<string, string>, children: RenderNode[] = []): RenderNode => ({
  type: 'element',
  tag,
  attrs,
  children
})

export const offlineShellFragmentId = 'fragment://fallback/offline-shell@v1'
const STORE_STREAM_LIMIT = 12

export const buildOfflineShellFragment = (id: string, path: string): FragmentPayload => {
  return {
    id,
    css: '',
    head: [{ op: 'title', value: `${siteBrand.name} | Offline` }],
    meta: {
      cacheKey: id,
      ttl: 30,
      staleTtl: 300,
      tags: ['fallback', 'offline', 'shell'],
      runtime: 'node'
    },
    tree: elementNode('section', { class: 'offline-shell' }, [
      elementNode('div', { class: 'meta-line' }, [textNode('offline mode')]),
      elementNode('h1', undefined, [textNode('You are offline')]),
      elementNode('p', undefined, [textNode('The shell is available, but live fragments need connectivity.')]),
      elementNode('div', { class: 'matrix' }, [
        elementNode('div', { class: 'cell' }, [
          textNode('Route'),
          elementNode('strong', undefined, [textNode(path || '/store')])
        ]),
        elementNode('div', { class: 'cell' }, [
          textNode('Status'),
          elementNode('strong', undefined, [textNode('Offline')])
        ])
      ]),
      elementNode('ul', { class: 'inline-list' }, [
        elementNode('li', undefined, [elementNode('span'), textNode('Check your connection')]),
        elementNode('li', undefined, [elementNode('span'), textNode('Refresh once you are back online')]),
        elementNode('li', undefined, [elementNode('span'), textNode('Cached content will load where available')])
      ])
    ])
  }
}

const resolveStoreApiBase = (request: Request) => {
  const apiBase = resolveServerApiBase(appConfig.apiBase, request)
  if (apiBase.startsWith('http://') || apiBase.startsWith('https://')) return apiBase
  const origin = resolveRequestOrigin(request)
  if (!origin) return ''
  if (apiBase.startsWith('/')) return `${origin}${apiBase}`
  return `${origin}/${apiBase}`
}

const buildStoreApiUrl = (apiBase: string, path: string) => {
  if (!apiBase) return ''
  const trimmed = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${trimmed}${suffix}`
}

const loadStoreSeed = async (request: Request): Promise<StoreSeed> => {
  const cookieHeader = request.headers.get('cookie')
  const cartItems = readStoreCartSnapshotFromCookie(cookieHeader)
  const queued = readStoreCartQueueFromCookie(cookieHeader)
  let streamItems: unknown[] = []

  try {
    const apiBase = resolveStoreApiBase(request)
    const url = buildStoreApiUrl(apiBase, `/store/items?limit=${STORE_STREAM_LIMIT}`)
    if (url) {
      const response = await fetch(url, {
        headers: { accept: 'application/json' },
        credentials: 'include'
      })
      if (response.ok) {
        const payload = (await response.json()) as { items?: unknown }
        if (Array.isArray(payload.items)) {
          streamItems = payload.items
        }
      }
    }
  } catch (error) {
    console.warn('Failed to seed store stream items', error)
  }

  return {
    stream: { items: streamItems },
    cart: { items: cartItems, queuedCount: queued.length }
  }
}

export const useFragmentResource = routeLoader$<FragmentResource | null>(async ({ url, request }) => {
  if (!storeEnabled) return null
  const path = url.pathname || '/store'
  const lang = resolveRequestLang(request)
  const storeSeed = await loadStoreSeed(request)

  try {
    const { plan, fragments, path: planPath } = await loadHybridFragmentResource(path, appConfig, lang, request)
    return {
      plan,
      fragments: fragments as FragmentPayloadValue,
      path: planPath,
      lang,
      shellState: readFragmentShellStateFromCookie(request.headers.get('cookie'), planPath),
      storeSeed
    }
  } catch (error) {
    console.error('Fragment plan fetch failed for store', error)
    const fallbackId = offlineShellFragmentId
    const plan: FragmentPlan = {
      path,
      createdAt: Date.now(),
      fragments: [
        {
          id: fallbackId,
          critical: true,
          layout: { column: 'span 12' }
        }
      ]
    }

    return {
      plan: plan as FragmentPlanValue,
      fragments: {
        [fallbackId]: buildOfflineShellFragment(fallbackId, path)
      } as FragmentPayloadValue,
      path,
      lang,
      shellState: readFragmentShellStateFromCookie(request.headers.get('cookie'), path),
      storeSeed
    }
  }
})

const DisabledStoreRoute = component$(() => {
  const copy = useLangCopy()
  return (
    <StaticRouteTemplate
      metaLine={copy.value.featureUnavailableMeta}
      title={copy.value.featureUnavailableTitle}
      description={copy.value.featureUnavailableDescription}
      actionLabel={copy.value.featureUnavailableAction}
      closeLabel={copy.value.fragmentClose}
    />
  )
})

const EnabledStoreRoute = component$(() => {
  const copy = useLangCopy()
  return (
    <FeatureStoreRoute
      copy={{
        metaLine: copy.value.storeMetaLine,
        title: copy.value.storeTitle,
        description: copy.value.storeDescription,
        actionLabel: copy.value.storeAction,
        closeLabel: copy.value.fragmentClose
      }}
    />
  )
})

export const onGet: RequestHandler = createCacheHandler(PUBLIC_SWR_CACHE)

export const StoreSkeleton = storeEnabled ? FeatureStoreSkeleton : StaticRouteSkeleton

export const head: DocumentHead = ({ resolveValue }: DocumentHeadProps) => {
  const data = resolveValue(useFragmentResource)
  const lang = data?.lang ?? defaultLang
  const copy = getUiCopy(lang)
  const title = storeEnabled ? copy.storeTitle : 'Feature disabled'
  const description = storeEnabled ? copy.storeDescription : 'This route is disabled in this site configuration.'

  return {
    title: `${title} | ${siteBrand.name}`,
    meta: [
      {
        name: 'description',
        content: description
      }
    ],
    htmlAttributes: {
      lang
    }
  }
}

export default component$(() => {
  if (!storeEnabled) {
    return <DisabledStoreRoute />
  }
  const location = useLocation()
  const fragmentResource = useFragmentResource()
  const cachedEntry = typeof window !== 'undefined' ? getFragmentShellCacheEntry(location.url.pathname) : undefined
  const cachedData = cachedEntry
    ? {
        plan: cachedEntry.plan,
        fragments: cachedEntry.fragments,
        path: cachedEntry.path,
        lang: cachedEntry.lang,
        shellState: null,
        storeSeed: {}
      }
    : null
  const data = fragmentResource.value ?? cachedData
  useContextProvider(StoreSeedContext, data?.storeSeed ?? null)
  if (data?.plan?.fragments?.length) {
    return (
      <FragmentShell
        plan={data.plan}
        initialFragments={data.fragments}
        path={data.path}
        initialLang={data.lang}
        initialShellState={data.shellState ?? undefined}
        preserveFragmentEffects
      />
    )
  }
  return <EnabledStoreRoute />
})
