import { component$ } from '@builder.io/qwik'
import { routeLoader$, type DocumentHead, type DocumentHeadProps, type RequestHandler } from '@builder.io/qwik-city'
import { StaticRouteSkeleton, StaticRouteTemplate } from '@prometheus/ui'
import { siteBrand, siteFeatures } from '../../config'
import { useLangCopy, useLanguageSeed } from '../../shared/lang-bridge'
import { createCacheHandler, PUBLIC_SWR_CACHE } from '../cache-headers'
import type { FragmentPlan, FragmentPlanValue } from '../../fragment/types'
import { loadHybridFragmentResource, loadStaticFragmentResource, resolveRequestLang } from '../fragment-resource'
import { defaultLang, type Lang } from '../../shared/lang-store'
import { readStoreCartQueueFromCookie, readStoreCartSnapshotFromCookie } from '../../shared/store-cart'
import type { StoreSeed } from '../../shared/store-seed'
import { normalizeStoreSortDir, normalizeStoreSortKey, type StoreSortDir, type StoreSortKey } from '../../shared/store-sort'
import { buildFragmentCssLinks } from '../../fragment/fragment-css'
import { storeLanguageSelection, withFragmentHeaderSelection, type LanguageSeedPayload } from '../../lang/selection'
import { StaticPageRoot } from '../../static-shell/StaticPageRoot'
import { StaticFragmentRoute } from '../../static-shell/StaticFragmentRoute'
import { buildStaticFragmentRouteModel, type StaticFragmentRouteModel } from '../../static-shell/static-fragment-model'
import { buildOfflineShellFragment, offlineShellFragmentId } from '../offline-shell-fragment'
import { isStaticShellBuild } from '../../static-shell/build-mode'

const storeEnabled = siteFeatures.store !== false
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

  return {
    stream: { items: [], sort: sortParams.sort, dir: sortParams.dir },
    cart: { items: cartItems, queuedCount: queued.length }
  }
}

export const useFragmentResource = routeLoader$<FragmentResource>(async ({ url, request }) => {
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
      : await loadHybridFragmentResource(path, appConfig, lang, request)
    const fragmentHeaderIds = plan.fragments.map((entry) => entry.id)
    return {
      plan,
      path: planPath,
      lang,
      staticRoute: plan.fragments.length
        ? buildStaticFragmentRouteModel({
            plan,
            fragments,
            lang,
            initialHtml,
            storeSeed
          })
        : null,
      storeSeed,
      languageSeed: createServerLanguageSeed(
        lang,
        withFragmentHeaderSelection(storeLanguageSelection, fragmentHeaderIds)
      )
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
        lang,
        storeSeed
      }),
      storeSeed,
      languageSeed: createServerLanguageSeed(
        lang,
        withFragmentHeaderSelection(storeLanguageSelection, [fallbackId])
      )
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
    <StaticRouteTemplate
      metaLine={copy.value.storeMetaLine}
      title={copy.value.storeTitle}
      description={copy.value.storeDescription}
      actionLabel={copy.value.storeAction}
      closeLabel={copy.value.fragmentClose}
    />
  )
})

export const onGet: RequestHandler = createCacheHandler(PUBLIC_SWR_CACHE)

export const StoreSkeleton = StaticRouteSkeleton

export const head: DocumentHead = ({ resolveValue }: DocumentHeadProps) => {
  const data = resolveValue(useFragmentResource)
  const lang = data?.lang ?? defaultLang
  const copy = data?.languageSeed.ui
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
    links: buildFragmentCssLinks(data?.plan),
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
        <DisabledStoreRoute />
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
      <EnabledStoreRoute />
    </StaticPageRoot>
  )
})
