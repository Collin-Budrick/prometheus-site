import { component$ } from '@builder.io/qwik'
import { routeLoader$, type DocumentHead, type DocumentHeadProps, type RequestHandler } from '@builder.io/qwik-city'
import { StaticRouteSkeleton, StaticRouteTemplate } from '@prometheus/ui'
import { siteBrand, siteFeatures } from '../../config'
import { createFeatureRouteHandler, ensureFeatureEnabled } from '../feature-bundle'
import { useLangCopy, useLanguageSeed, useSharedLangSignal } from '../../shared/lang-bridge'
import { createCacheHandler, PUBLIC_SWR_CACHE } from '../cache-headers'
import type { FragmentPlan, FragmentPlanValue } from '../../fragment/types'
import { loadHybridFragmentResource, loadStaticFragmentResource, resolveRequestLang, resolveViewportHint } from '../fragment-resource'
import { defaultLang, type Lang } from '../../shared/lang-store'
import { readStoreCartQueueFromCookie, readStoreCartSnapshotFromCookie } from '../../features/store/store-cart'
import type { StoreSeed } from '../../features/store/store-seed'
import { normalizeStoreSortDir, normalizeStoreSortKey, type StoreSortDir, type StoreSortKey } from '../../features/store/store-sort'
import { loadServerStoreInventory } from '../../features/store/store-inventory.server'
import { buildFragmentCssLinks } from '../../fragment/fragment-css'
import {
  emptyUiCopy,
  storeLanguageSelection,
  withFragmentHeaderSelection,
  type LanguageSeedPayload
} from '../../lang/selection'
import { StaticPageRoot } from '../../shell/core/StaticPageRoot'
import { StaticFragmentRoute } from '../../shell/fragments/StaticFragmentRoute'
import { buildStaticFragmentRouteModel, type StaticFragmentRouteModel } from '../../shell/fragments/static-fragment-model'
import { buildOfflineShellFragment, offlineShellFragmentId } from '../offline-shell-fragment'
import { isStaticShellBuild } from '../../shell/core/build-mode'
import { buildGlobalStylesheetLinks } from '../../shell/core/global-style-assets'
import { isSiteFeatureEnabled } from '../../template-features'
import { starterStoreItems } from '../../template-starter-data'

const storeEnabled = isSiteFeatureEnabled('store')
type FragmentResource = {
  plan: FragmentPlanValue | null
  path: string
  lang: Lang
  staticRoute: StaticFragmentRouteModel | null
  storeSeed: StoreSeed
  languageSeed: LanguageSeedPayload
}

const resolveStoreSort = (url: URL): { sort: StoreSortKey; dir: StoreSortDir } => {
  return {
    sort: normalizeStoreSortKey(url.searchParams.get('sort')),
    dir: normalizeStoreSortDir(url.searchParams.get('dir'))
  }
}

const loadStoreSeed = async (
  request: Request,
  sortParams: { sort: StoreSortKey; dir: StoreSortDir }
): Promise<StoreSeed> => {
  const cookieHeader = request.headers.get('cookie')
  const cartItems = readStoreCartSnapshotFromCookie(cookieHeader)
  const queued = readStoreCartQueueFromCookie(cookieHeader)
  const inventoryItems = await loadServerStoreInventory(request)
  const seededItems = inventoryItems.length > 0 ? inventoryItems : [...starterStoreItems]

  return {
    stream: { items: seededItems, sort: sortParams.sort, dir: sortParams.dir },
    cart: { items: cartItems, queuedCount: queued.length }
  }
}

export const useFragmentResource = routeLoader$<FragmentResource>(async ({ url, request }) => {
  ensureFeatureEnabled('store')
  const { createServerLanguageSeed } = await import('../../lang/server')
  const { appConfig } = await import('../../app-config.server')
  const path = url.pathname || '/store'
  const lang = resolveRequestLang(request)
  const sortParams = resolveStoreSort(url)
  const storeSeed = await loadStoreSeed(request, sortParams)
  if (!storeEnabled) {
    return {
      plan: null,
      path,
      lang,
      staticRoute: null,
      storeSeed,
      languageSeed: createServerLanguageSeed(lang, storeLanguageSelection)
    }
  }

  try {
    const { plan, fragments, path: planPath, initialHtml } = isStaticShellBuild()
      ? await loadStaticFragmentResource(path, lang, request)
      : await loadHybridFragmentResource(path, appConfig, lang, request, { includeAllFragments: true })
    const fragmentEntries = plan?.fragments ?? []
    const fragmentHeaderIds = fragmentEntries.map((entry) => entry.id)
    const languageSeed = createServerLanguageSeed(
      lang,
      withFragmentHeaderSelection(storeLanguageSelection, fragmentHeaderIds)
    )
    return {
      plan,
      path: planPath,
      lang,
      staticRoute: fragmentEntries.length
          ? buildStaticFragmentRouteModel({
            plan,
            fragments,
            fragmentCopy: languageSeed.fragments,
            lang,
            initialHtml,
            storeSeed,
            cookieHeader: request.headers.get('cookie'),
            viewportHint: resolveViewportHint(request)
          })
        : null,
      storeSeed,
      languageSeed
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
      path,
      lang,
      staticRoute: buildStaticFragmentRouteModel({
        plan: plan as FragmentPlanValue,
        fragments: {
          [fallbackId]: buildOfflineShellFragment(fallbackId, path)
        },
        fragmentCopy: createServerLanguageSeed(
          lang,
          withFragmentHeaderSelection(storeLanguageSelection, [fallbackId])
        ).fragments,
        lang,
        storeSeed,
        cookieHeader: request.headers.get('cookie'),
        viewportHint: resolveViewportHint(request)
      }),
      storeSeed,
      languageSeed: createServerLanguageSeed(
        lang,
        withFragmentHeaderSelection(storeLanguageSelection, [fallbackId])
      )
    }
  }
})

const DisabledStoreRoute = component$<{ lang: Lang }>(({ lang }) => {
  const copy = useLangCopy(useSharedLangSignal(lang))
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

const EnabledStoreRoute = component$<{ lang: Lang }>(({ lang }) => {
  const copy = useLangCopy(useSharedLangSignal(lang))

  return (
    <StaticRouteTemplate
      metaLine={copy.value.storeMetaLine}
      title={copy.value.storeTitle}
      description={copy.value.storeDescription}
      actionLabel={copy.value.storeAction}
      closeLabel={copy.value.fragmentClose}
    />
  )
})

export const onGet: RequestHandler = createFeatureRouteHandler(
  'store',
  createCacheHandler(PUBLIC_SWR_CACHE)
)

export const StoreSkeleton = StaticRouteSkeleton

export const head: DocumentHead = ({ resolveValue }: DocumentHeadProps) => {
  const data = resolveValue(useFragmentResource)
  const lang = data?.lang ?? defaultLang
  const copy = { ...emptyUiCopy, ...(data?.languageSeed.ui ?? {}) }
  const title = storeEnabled ? copy.storeTitle : copy.featureUnavailableTitle
  const description = storeEnabled ? copy.storeDescription : copy.featureUnavailableDescription

  return {
    title: `${title} | ${siteBrand.name}`,
    meta: [
      {
        name: 'description',
        content: description
      }
    ],
    links: buildGlobalStylesheetLinks(buildFragmentCssLinks(data?.plan)),
    htmlAttributes: {
      lang
    }
  }
}

export default component$(() => {
  const fragmentResource = useFragmentResource()
  useLanguageSeed(fragmentResource.value.lang, fragmentResource.value.languageSeed)
  if (!storeEnabled) {
    return (
      <StaticPageRoot>
        <DisabledStoreRoute lang={fragmentResource.value.lang} />
      </StaticPageRoot>
    )
  }
  const data = fragmentResource.value
  if (data.staticRoute?.entries.length) {
    return (
      <StaticFragmentRoute
        model={data.staticRoute}
      />
    )
  }
  return (
    <StaticPageRoot>
      <EnabledStoreRoute lang={data.lang} />
    </StaticPageRoot>
  )
})
