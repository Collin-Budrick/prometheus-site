import { component$ } from '@builder.io/qwik'
import { routeLoader$, type DocumentHead, type DocumentHeadProps, type RequestHandler } from '@builder.io/qwik-city'
import { StaticRouteTemplate } from '@prometheus/ui'
import { siteBrand } from '../../config'
import { useLangCopy, useLanguageSeed } from '../../shared/lang-bridge'
import { createCacheHandler, PRIVATE_REVALIDATE_CACHE } from '../cache-headers'
import { loadHybridFragmentResource, resolveRequestLang, resolveViewportHint } from '../fragment-resource'
import { defaultLang, type Lang } from '../../shared/lang-store'
import { loadAuthSession } from '../../shared/auth-session'
import type { FragmentPlanValue } from '../../fragment/types'
import type { ContactInvitesSeed } from '../../shared/contact-invites-seed'
import { emptyInviteGroups } from '../../components/contact-invites/data'
import { buildFragmentCssLinks } from '../../fragment/fragment-css'
import { chatLanguageSelection, withFragmentHeaderSelection, type LanguageSeedPayload } from '../../lang/selection'
import { StaticFragmentRoute } from '../../static-shell/StaticFragmentRoute'
import { StaticPageRoot } from '../../static-shell/StaticPageRoot'
import {
  buildStaticFragmentRouteModel,
  createStaticFragmentRouteData,
  type StaticFragmentRouteModel
} from '../../static-shell/static-fragment-model'
import { isStaticShellBuild } from '../../static-shell/build-mode'
import { STATIC_FRAGMENT_DATA_SCRIPT_ID } from '../../static-shell/constants'

type ProtectedRouteData = {
  lang: Lang
  languageSeed: LanguageSeedPayload
}

export const useChatData = routeLoader$<ProtectedRouteData>(async ({ request, redirect }) => {
  const { createServerLanguageSeed } = await import('../../lang/server')
  const lang = resolveRequestLang(request)
  if (isStaticShellBuild()) {
    return { lang, languageSeed: createServerLanguageSeed(lang, chatLanguageSelection) }
  }
  const session = await loadAuthSession(request)
  if (session.status !== 'authenticated') {
    throw redirect(302, '/login')
  }
  return { lang, languageSeed: createServerLanguageSeed(lang, chatLanguageSelection) }
})

type FragmentResource = {
  plan: FragmentPlanValue | null
  path: string
  lang: Lang
  staticRoute: StaticFragmentRouteModel | null
  contactInvitesSeed: ContactInvitesSeed | null
  languageSeed: LanguageSeedPayload | null
}

const loadContactInvitesSeed = async (_request: Request): Promise<ContactInvitesSeed> => ({
  invites: emptyInviteGroups
})

export const useFragmentResource = routeLoader$<FragmentResource>(async ({ url, request }) => {
  const { createServerLanguageSeed } = await import('../../lang/server')
  const { appConfig } = await import('../../app-config.server')
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
    const { plan, fragments, path: planPath, initialHtml } = await loadHybridFragmentResource(path, appConfig, lang, request)
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
            contactInvitesSeed,
            cookieHeader: request.headers.get('cookie'),
            viewportHint: resolveViewportHint(request)
          })
        : null,
      contactInvitesSeed,
      languageSeed: createServerLanguageSeed(
        lang,
        withFragmentHeaderSelection({ fragmentHeaders: [] }, fragmentHeaderIds)
      )
    }
  } catch (error) {
    console.error('Fragment plan fetch failed for chat', error)
    return {
      plan: null,
      path,
      lang,
      staticRoute: null,
      contactInvitesSeed,
      languageSeed: null
    }
  }
})

export const onGet: RequestHandler = createCacheHandler(PRIVATE_REVALIDATE_CACHE)

export const head: DocumentHead = ({ resolveValue }: DocumentHeadProps) => {
  const data = resolveValue(useChatData)
  const fragmentData = resolveValue(useFragmentResource)
  const lang = data?.lang ?? defaultLang
  const copy = data?.languageSeed.ui
  const description = copy.protectedDescription.replace('{{label}}', copy.navChat)

  return {
    title: `${copy.navChat} | ${siteBrand.name}`,
    meta: [
      {
        name: 'description',
        content: description
      }
    ],
    links: buildFragmentCssLinks(fragmentData?.plan),
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
  const copy = useLangCopy()
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
