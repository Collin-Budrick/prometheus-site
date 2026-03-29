import { component$ } from '@builder.io/qwik'
import { routeLoader$, type DocumentHead, type DocumentHeadProps, type RequestHandler } from '@builder.io/qwik-city'
import { starterContactInvites } from '@prometheus/template-config'
import { StaticRouteTemplate } from '@prometheus/ui'
import { siteBrand } from '../site-config'
import {
  createProtectedFeatureRouteHandler,
  ensureFeatureEnabled,
  PRIVATE_REVALIDATE_CACHE
} from './route-utils'
import { useLangCopy, useLanguageSeed, useSharedLangSignal } from '../shared/lang-bridge'
import { loadHybridFragmentResource, resolveRequestLang, resolveViewportHint } from './fragment-resource'
import { defaultLang, type Lang } from '../shared/lang-store'
import type { FragmentPlanValue } from '../fragment/types'
import type { ContactInvitesSeed } from '../features/messaging/contact-invites-seed'
import { normalizeInviteGroups } from '../components/contact-invites/data'
import { buildFragmentCssLinks } from '../fragment/fragment-css'
import {
  chatLanguageSelection,
  emptyUiCopy,
  withFragmentHeaderSelection,
  type LanguageSeedPayload
} from '../lang/selection'
import { StaticFragmentRoute } from '../shell/fragments/StaticFragmentRoute'
import { StaticPageRoot } from '../shell/core/StaticPageRoot'
import {
  buildStaticFragmentRouteModel,
  createStaticFragmentRouteData,
  type StaticFragmentRouteModel
} from '../shell/fragments/static-fragment-model'
import { isStaticShellBuild } from '../shell/core/build-mode'
import { STATIC_FRAGMENT_DATA_SCRIPT_ID } from '../shell/core/constants'
import { buildGlobalStylesheetLinks } from '../shell/core/global-style-assets'

type ProtectedRouteData = {
  lang: Lang
  languageSeed: LanguageSeedPayload
}

export const useChatData = routeLoader$<ProtectedRouteData>(async ({ request }) => {
  ensureFeatureEnabled('messaging')
  const { createServerLanguageSeed } = await import('../lang/server')
  const lang = resolveRequestLang(request)
  if (isStaticShellBuild()) {
    return { lang, languageSeed: createServerLanguageSeed(lang, chatLanguageSelection) }
  }
  return { lang, languageSeed: createServerLanguageSeed(lang, chatLanguageSelection) }
})

type FragmentResource = {
  plan: FragmentPlanValue | null
  path: string
  lang: Lang
  staticRoute: StaticFragmentRouteModel | null
  contactInvitesSeed: ContactInvitesSeed | null
  languageSeed: LanguageSeedPayload
}

const loadContactInvitesSeed = async (_request: Request): Promise<ContactInvitesSeed> => ({
  invites: normalizeInviteGroups(starterContactInvites.invites)
})

export const useFragmentResource = routeLoader$<FragmentResource>(async ({ url, request }) => {
  ensureFeatureEnabled('messaging')
  const { createServerLanguageSeed } = await import('../lang/server')
  const { appConfig } = await import('../site-config.server')
  const path = url.pathname || '/chat'
  const lang = resolveRequestLang(request)
  if (isStaticShellBuild()) {
    return {
      plan: null,
      path,
      lang,
      staticRoute: null,
      contactInvitesSeed: null,
      languageSeed: createServerLanguageSeed(lang, chatLanguageSelection)
    }
  }
  const contactInvitesSeed = await loadContactInvitesSeed(request)

  try {
    const { plan, fragments, path: planPath, initialHtml } = await loadHybridFragmentResource(
      path,
      appConfig,
      lang,
      request,
      { includeAllFragments: true }
    )
    const fragmentEntries = plan?.fragments ?? []
    const fragmentHeaderIds = fragmentEntries.map((entry) => entry.id)
    const languageSeed = createServerLanguageSeed(
      lang,
      withFragmentHeaderSelection(chatLanguageSelection, fragmentHeaderIds)
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
            contactInvitesSeed,
            cookieHeader: request.headers.get('cookie'),
            viewportHint: resolveViewportHint(request)
          })
        : null,
      contactInvitesSeed,
      languageSeed
    }
  } catch (error) {
    console.error('Fragment plan fetch failed for chat', error)
    return {
      plan: null,
      path,
      lang,
      staticRoute: null,
      contactInvitesSeed,
      languageSeed: createServerLanguageSeed(lang, chatLanguageSelection)
    }
  }
})

export const onGet: RequestHandler = createProtectedFeatureRouteHandler('messaging', PRIVATE_REVALIDATE_CACHE)

export const head: DocumentHead = ({ resolveValue }: DocumentHeadProps) => {
  const data = resolveValue(useChatData)
  const fragmentData = resolveValue(useFragmentResource)
  const lang = data?.lang ?? defaultLang
  const copy = { ...emptyUiCopy, ...(data?.languageSeed.ui ?? {}) }
  const description = copy.protectedDescription.replace('{{label}}', copy.navChat)

  return {
    title: `${copy.navChat} | ${siteBrand.name}`,
    meta: [
      {
        name: 'description',
        content: description
      }
    ],
    links: buildGlobalStylesheetLinks(buildFragmentCssLinks(fragmentData?.plan)),
    htmlAttributes: {
      lang
    }
  }
}

export default component$(() => {
  const data = useChatData()
  const fragmentResource = useFragmentResource()
  useLanguageSeed(data.value.lang, data.value.languageSeed)
  useLanguageSeed(fragmentResource.value.lang, fragmentResource.value.languageSeed)
  const fragmentData = fragmentResource.value
  const copy = useLangCopy(useSharedLangSignal(data.value.lang))
  void data.value
  const description = copy.value.protectedDescription.replace('{{label}}', copy.value.navChat)

  if (fragmentData.staticRoute?.entries.length) {
    return (
      <StaticFragmentRoute
        model={fragmentData.staticRoute}
      />
    )
  }

  return (
    <StaticPageRoot
      routeDataScriptId={STATIC_FRAGMENT_DATA_SCRIPT_ID}
      routeData={createStaticFragmentRouteData({
        path: fragmentData.path,
        lang: fragmentData.lang,
        contactInvitesSeed: fragmentData.contactInvitesSeed
      })}
    >
      <StaticRouteTemplate
        metaLine={copy.value.protectedMetaLine}
        title={copy.value.navChat}
        description={description}
        actionLabel={copy.value.protectedAction}
        closeLabel={copy.value.fragmentClose}
      />
    </StaticPageRoot>
  )
})
