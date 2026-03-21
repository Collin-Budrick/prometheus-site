import { component$ } from '@builder.io/qwik'
import { routeLoader$, type DocumentHead, type DocumentHeadProps, type RequestHandler } from '@builder.io/qwik-city'
import { StaticRouteSkeleton, StaticRouteTemplate } from '@prometheus/ui'
import { isSiteFeatureEnabled, siteBrand, siteFeatures } from '../../site-config'
import { createCacheHandler, createFeatureRouteHandler, ensureFeatureEnabled, PRIVATE_REVALIDATE_CACHE } from '../route-utils'
import { useLangCopy, useLanguageSeed, useSharedLangSignal } from '../../shared/lang-bridge'
import { resolveRequestLang } from '../fragment-resource'
import { defaultLang, type Lang } from '../../shared/lang-store'
import { emptyUiCopy, loginLanguageSelection, type LanguageSeedPayload } from '../../lang/selection'
import type { UiCopy } from '../../lang/types'
import { StaticPageRoot } from '../../shell/core/StaticPageRoot'
import { StaticLoginRoute } from '../../shell/auth/StaticLoginRoute'
import { buildGlobalStylesheetLinks } from '../../shell/core/global-style-assets'

const loginEnabled = isSiteFeatureEnabled('auth')
type LoginResource = {
  lang: Lang
  languageSeed: LanguageSeedPayload
}

const resolveLoginCopy = (seed?: Partial<UiCopy>) => ({
  loginMetaLine: seed?.loginMetaLine ?? emptyUiCopy.loginMetaLine,
  loginTitle: seed?.loginTitle ?? emptyUiCopy.loginTitle,
  loginDescription: seed?.loginDescription ?? emptyUiCopy.loginDescription,
  loginAction: seed?.loginAction ?? emptyUiCopy.loginAction,
  authSocialSectionLabel: seed?.authSocialSectionLabel ?? emptyUiCopy.authSocialSectionLabel,
  authMethodsLabel: seed?.authMethodsLabel ?? emptyUiCopy.authMethodsLabel,
  authHostedStatus: seed?.authHostedStatus ?? emptyUiCopy.authHostedStatus
})

export const useLoginResource = routeLoader$<LoginResource>(async ({ request }) => {
  ensureFeatureEnabled('auth')
  const { createServerLanguageSeed } = await import('../../lang/server')
  const lang = resolveRequestLang(request)
  if (!loginEnabled) {
    return {
      lang,
      languageSeed: createServerLanguageSeed(lang, loginLanguageSelection)
    }
  }

  return {
    lang,
    languageSeed: createServerLanguageSeed(lang, loginLanguageSelection)
  }
})

const DisabledLoginRoute = component$<{ lang: Lang }>(({ lang }) => {
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

export const onGet: RequestHandler = createFeatureRouteHandler(
  'auth',
  createCacheHandler(PRIVATE_REVALIDATE_CACHE)
)

export const LoginSkeleton = StaticRouteSkeleton

export const head: DocumentHead = ({ resolveValue }: DocumentHeadProps) => {
  const data = resolveValue(useLoginResource)
  const lang = data?.lang ?? defaultLang
  const copy = {
    ...emptyUiCopy,
    ...(data?.languageSeed.ui ?? {})
  }
  const title = loginEnabled ? copy.loginTitle : copy.featureUnavailableTitle
  const description = loginEnabled ? copy.loginDescription : copy.featureUnavailableDescription

  return {
    title: `${title} | ${siteBrand.name}`,
    meta: [
      {
        name: 'description',
        content: description
      }
    ],
    links: buildGlobalStylesheetLinks(),
    htmlAttributes: {
      lang
    }
  }
}

export default component$(() => {
  const loginResource = useLoginResource()
  useLanguageSeed(loginResource.value.lang, loginResource.value.languageSeed)
  const data = loginResource.value
  if (!loginEnabled) {
    return (
      <StaticPageRoot>
        <DisabledLoginRoute lang={data.lang} />
      </StaticPageRoot>
    )
  }
  return (
    <StaticLoginRoute
      copy={resolveLoginCopy(data.languageSeed.ui)}
      lang={data.lang}
    />
  )
})
