import { component$ } from '@builder.io/qwik'
import { routeLoader$, type DocumentHead, type DocumentHeadProps, type RequestHandler } from '@builder.io/qwik-city'
import { StaticRouteSkeleton, StaticRouteTemplate } from '@prometheus/ui'
import { isSiteFeatureEnabled, siteBrand } from '../../site-config'
import {
  buildLoginRedirectHref,
  createClientLoginRedirectResponse,
  createFeatureRouteHandler,
  ensureFeatureEnabled,
  PRIVATE_REVALIDATE_CACHE,
  resolveInternalNextPath
} from '../route-utils'
import { useLangCopy, useLanguageSeed, useSharedLangSignal } from '../../shared/lang-bridge'
import { resolveRequestLang } from '../fragment-resource'
import { defaultLang, type Lang } from '../../shared/lang-store'
import { emptyUiCopy, loginLanguageSelection, type LanguageSeedPayload } from '../../lang/selection'
import type { UiCopy } from '../../lang/types'
import { getOrCreateRequestCspNonce } from '../../security/server'
import { StaticPageRoot } from '../../shell/core/StaticPageRoot'
import { StaticLoginRoute } from '../../shell/auth/StaticLoginRoute'
import { buildGlobalStylesheetLinks } from '../../shell/core/global-style-assets'

const loginEnabled = isSiteFeatureEnabled('auth')
type LoginResource = {
  lang: Lang
  languageSeed: LanguageSeedPayload
  nextPath: string | null
}

const resolveLoginCopy = (seed?: Partial<UiCopy>) => ({
  loginMetaLine: seed?.loginMetaLine ?? emptyUiCopy.loginMetaLine,
  loginTitle: seed?.loginTitle ?? emptyUiCopy.loginTitle,
  loginDescription: seed?.loginDescription ?? emptyUiCopy.loginDescription,
  loginAction: seed?.loginAction ?? emptyUiCopy.loginAction,
  loginTab: seed?.loginTab ?? emptyUiCopy.loginTab,
  signupTab: seed?.signupTab ?? emptyUiCopy.signupTab,
  signupTitle: seed?.signupTitle ?? emptyUiCopy.signupTitle,
  signupDescription: seed?.signupDescription ?? emptyUiCopy.signupDescription,
  signupAction: seed?.signupAction ?? emptyUiCopy.signupAction,
  authNameLabel: seed?.authNameLabel ?? emptyUiCopy.authNameLabel,
  authEmailLabel: seed?.authEmailLabel ?? emptyUiCopy.authEmailLabel,
  authPasswordLabel: seed?.authPasswordLabel ?? emptyUiCopy.authPasswordLabel,
  authRememberLabel: seed?.authRememberLabel ?? emptyUiCopy.authRememberLabel,
  authSocialSectionLabel: seed?.authSocialSectionLabel ?? emptyUiCopy.authSocialSectionLabel,
  authMethodsLabel: seed?.authMethodsLabel ?? emptyUiCopy.authMethodsLabel,
  authHostedStatus: seed?.authHostedStatus ?? emptyUiCopy.authHostedStatus,
  authNotConfigured: seed?.authNotConfigured ?? emptyUiCopy.authNotConfigured
})

export const useLoginResource = routeLoader$<LoginResource>(async ({ request }) => {
  ensureFeatureEnabled('auth')
  const { createServerLanguageSeed } = await import('../../lang/server')
  const lang = resolveRequestLang(request)
  if (!loginEnabled) {
    return {
      lang,
      languageSeed: createServerLanguageSeed(lang, loginLanguageSelection),
      nextPath: null
    }
  }

  return {
    lang,
    languageSeed: createServerLanguageSeed(lang, loginLanguageSelection),
    nextPath: null
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
  async (event) => {
    event.headers.set('Cache-Control', PRIVATE_REVALIDATE_CACHE)
    const currentUrl = new URL(event.request.url)
    const requestedNext = currentUrl.searchParams.get('next')
    if (requestedNext) {
      const nextPath = resolveInternalNextPath(requestedNext, currentUrl.origin)
      return createClientLoginRedirectResponse({
        loginHref: buildLoginRedirectHref(event.request),
        nextPath,
        cacheControl: PRIVATE_REVALIDATE_CACHE,
        nonce: getOrCreateRequestCspNonce(event),
        currentOrigin: currentUrl.origin,
        pathname: currentUrl.pathname
      })
    }
  }
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
      nextPath={data.nextPath}
    />
  )
})
