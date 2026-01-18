import { component$ } from '@builder.io/qwik'
import { routeLoader$, useLocation, type DocumentHead, type DocumentHeadProps, type RequestHandler } from '@builder.io/qwik-city'
import { StaticRouteTemplate } from '@prometheus/ui'
import { siteBrand } from '../../config'
import { useLangCopy } from '../../shared/lang-bridge'
import { getUiCopy } from '../../shared/ui-copy'
import { createCacheHandler, PRIVATE_NO_STORE_CACHE } from '../cache-headers'
import { loadHybridFragmentResource, resolveRequestLang } from '../fragment-resource'
import { defaultLang, type Lang } from '../../shared/lang-store'
import { loadAuthSession } from '../../shared/auth-session'
import { FragmentShell, getFragmentShellCacheEntry } from '../../fragment/ui'
import type { FragmentPayloadValue, FragmentPlanValue } from '../../fragment/types'
import { appConfig } from '../../app-config'

type ProtectedRouteData = {
  lang: Lang
}

export const useChatData = routeLoader$<ProtectedRouteData>(async ({ request, redirect }) => {
  const lang = resolveRequestLang(request)
  const session = await loadAuthSession(request)
  if (session.status !== 'authenticated') {
    throw redirect(302, '/login')
  }
  return { lang }
})

type FragmentResource = {
  plan: FragmentPlanValue
  fragments: FragmentPayloadValue
  path: string
  lang: Lang
}

export const useFragmentResource = routeLoader$<FragmentResource | null>(async ({ url, request }) => {
  const path = url.pathname || '/chat'
  const lang = resolveRequestLang(request)

  try {
    const { plan, fragments, path: planPath } = await loadHybridFragmentResource(path, appConfig, lang, request)
    return {
      plan,
      fragments: fragments as FragmentPayloadValue,
      path: planPath,
      lang
    }
  } catch (error) {
    console.error('Fragment plan fetch failed for chat', error)
    return null
  }
})

export const onGet: RequestHandler = createCacheHandler(PRIVATE_NO_STORE_CACHE)

export const head: DocumentHead = ({ resolveValue }: DocumentHeadProps) => {
  const data = resolveValue(useChatData)
  const lang = data?.lang ?? defaultLang
  const copy = getUiCopy(lang)
  const description = copy.protectedDescription.replace('{{label}}', copy.navChat)

  return {
    title: `${copy.navChat} | ${siteBrand.name}`,
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
  const location = useLocation()
  const data = useChatData()
  const fragmentResource = useFragmentResource()
  const cachedEntry = typeof window !== 'undefined' ? getFragmentShellCacheEntry(location.url.pathname) : undefined
  const cachedData = cachedEntry
    ? { plan: cachedEntry.plan, fragments: cachedEntry.fragments, path: cachedEntry.path, lang: cachedEntry.lang }
    : null
  const fragmentData = fragmentResource.value ?? cachedData
  const copy = useLangCopy()
  void data.value
  const description = copy.value.protectedDescription.replace('{{label}}', copy.value.navChat)

  if (fragmentData?.plan?.fragments?.length) {
    return (
      <FragmentShell
        plan={fragmentData.plan}
        initialFragments={fragmentData.fragments}
        path={fragmentData.path}
        initialLang={fragmentData.lang}
      />
    )
  }

  return (
    <StaticRouteTemplate
      metaLine={copy.value.protectedMetaLine}
      title={copy.value.navChat}
      description={description}
      actionLabel={copy.value.protectedAction}
      closeLabel={copy.value.fragmentClose}
    />
  )
})
