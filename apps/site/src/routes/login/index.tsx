import { component$ } from '@builder.io/qwik'
import { routeLoader$, type DocumentHead, type DocumentHeadProps, type RequestHandler } from '@builder.io/qwik-city'
import { StaticRouteSkeleton, StaticRouteTemplate } from '@prometheus/ui'
import { siteBrand, siteFeatures } from '../../config'
import { createCacheHandler, PRIVATE_REVALIDATE_CACHE } from '../cache-headers'
import { useLangCopy, useLanguageSeed } from '../../shared/lang-bridge'
import { resolveRequestLang } from '../fragment-resource'
import { defaultLang, type Lang } from '../../shared/lang-store'
import { emptyUiCopy, loginLanguageSelection, type LanguageSeedPayload } from '../../lang/selection'
import type { UiCopy } from '../../lang/types'
import { StaticPageRoot } from '../../static-shell/StaticPageRoot'
import { StaticLoginRoute } from '../../static-shell/StaticLoginRoute'

const loginEnabled = siteFeatures.login !== false
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

const DisabledLoginRoute = component$(() => {
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

export const onGet: RequestHandler = createCacheHandler(PRIVATE_REVALIDATE_CACHE)

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
        <DisabledLoginRoute />
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
