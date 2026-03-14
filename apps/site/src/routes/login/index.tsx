import { component$, noSerialize, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import type { NoSerialize } from '@builder.io/qwik'
import { routeLoader$, type DocumentHead, type DocumentHeadProps, type RequestHandler } from '@builder.io/qwik-city'
import { StaticRouteSkeleton, StaticRouteTemplate } from '@prometheus/ui'
import { siteBrand, siteFeatures } from '../../config'
import { createCacheHandler, PRIVATE_REVALIDATE_CACHE } from '../cache-headers'
import { useLangCopy, useLanguageSeed } from '../../shared/lang-bridge'
import type { FragmentPlanValue } from '../../fragment/types'
import { appConfig } from '../../public-app-config'
import { loadHybridFragmentResource, resolveRequestLang, resolveViewportHint } from '../fragment-resource'
import { defaultLang, type Lang } from '../../shared/lang-store'
import { buildFragmentCssLinks } from '../../fragment/fragment-css'
import { loginLanguageSelection, withFragmentHeaderSelection, type LanguageSeedPayload } from '../../lang/selection'
import { resolveAuthFormState, type AuthFormState } from '@features/auth/auth-form-state'
import { StaticFragmentRoute } from '../../static-shell/StaticFragmentRoute'
import { StaticPageRoot } from '../../static-shell/StaticPageRoot'
import { StaticLoginRoute } from '../../static-shell/StaticLoginRoute'
import { buildStaticFragmentRouteModel, type StaticFragmentRouteModel } from '../../static-shell/static-fragment-model'
import { isStaticShellBuild } from '../../static-shell/build-mode'

type LoginClientModule = typeof import('@features/auth/pages/Login.client')
type LoginClientRoute = LoginClientModule['LoginRoute']

const loginEnabled = siteFeatures.login !== false
type FragmentResource = {
  plan: FragmentPlanValue | null
  path: string
  lang: Lang
  staticRoute: StaticFragmentRouteModel | null
  staticLogin: boolean
  languageSeed: LanguageSeedPayload
}

export const useAuthFormState = routeLoader$<AuthFormState>(({ request }) =>
  resolveAuthFormState(request.headers.get('cookie'))
)

export const useFragmentResource = routeLoader$<FragmentResource>(async ({ url, request }) => {
  const { createServerLanguageSeed } = await import('../../lang/server')
  const { appConfig } = await import('../../app-config.server')
  const path = url.pathname || '/login'
  const lang = resolveRequestLang(request)
  if (!loginEnabled) {
    return {
      plan: null,
      path,
      lang,
      staticRoute: null,
      staticLogin: false,
      languageSeed: createServerLanguageSeed(lang, loginLanguageSelection)
    }
  }

  if (isStaticShellBuild()) {
    return {
      plan: null,
      path,
      lang,
      staticRoute: null,
      staticLogin: true,
      languageSeed: createServerLanguageSeed(lang, loginLanguageSelection)
    }
  }

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
            cookieHeader: request.headers.get('cookie'),
            viewportHint: resolveViewportHint(request)
          })
        : null,
      staticLogin: false,
      languageSeed: createServerLanguageSeed(
        lang,
        withFragmentHeaderSelection(loginLanguageSelection, fragmentHeaderIds)
      )
    }
  } catch (error) {
    console.error('Fragment plan fetch failed for login', error)
    return {
      plan: null,
      path,
      lang,
      staticRoute: null,
      staticLogin: false,
      languageSeed: createServerLanguageSeed(lang, loginLanguageSelection)
    }
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

const LoginFallbackSkeleton = component$(() => (
  <section class="fragment-shell" aria-hidden="true">
    <div class="fragment-grid" data-fragment-grid="main">
      <article class="fragment-card" style={{ gridColumn: 'span 12' }} data-motion>
        <span class="skeleton-line is-short" />
        <span class="skeleton-line is-medium" />
        <span class="skeleton-line is-long" />
        <span class="skeleton-line is-button" />
      </article>
    </div>
  </section>
))

const EnabledLoginRoute = component$(() => {
  const authFormState = useAuthFormState()
  const fragmentResource = useFragmentResource()
  const copy = fragmentResource.value.languageSeed.ui
  const featureRoute = useSignal<NoSerialize<LoginClientRoute> | null>(null)

  useVisibleTask$(
    async () => {
      if (featureRoute.value) return
      const { LoginRoute } = await import('@features/auth/pages/Login.client')
      featureRoute.value = noSerialize(LoginRoute)
    },
    { strategy: 'document-ready' }
  )
  const FeatureLoginRoute = featureRoute.value as LoginClientRoute | null
  if (!FeatureLoginRoute) {
    return <LoginFallbackSkeleton />
  }

  return (
    <FeatureLoginRoute
      apiBase={appConfig.apiBase}
      initialFormState={authFormState.value}
      copy={{
        metaLine: copy.value.loginMetaLine,
        title: copy.value.loginTitle,
        description: copy.value.loginDescription,
        actionLabel: copy.value.loginAction,
        loginTabLabel: copy.value.loginTab,
        signupTabLabel: copy.value.signupTab,
        signupTitle: copy.value.signupTitle,
        signupDescription: copy.value.signupDescription,
        signupActionLabel: copy.value.signupAction,
        nameLabel: copy.value.authNameLabel,
        emailLabel: copy.value.authEmailLabel,
        passwordLabel: copy.value.authPasswordLabel,
        rememberLabel: copy.value.authRememberLabel,
        passkeyLabel: copy.value.authPasskeyLabel,
        passkeyHint: copy.value.authPasskeyHint,
        authBiometricLoginLabel: copy.value.authBiometricLoginLabel,
        authBiometricLoginHint: copy.value.authBiometricLoginHint,
        authBiometricLoginUnavailable: copy.value.authBiometricLoginUnavailable,
        authBiometricLoginFailed: copy.value.authBiometricLoginFailed,
        authBiometricLoginCredentialsExpired: copy.value.authBiometricLoginCredentialsExpired,
        socialSectionLabel: copy.value.authSocialSectionLabel,
        methodsLabel: copy.value.authMethodsLabel,
        hostedStatus: copy.value.authHostedStatus,
        notConfiguredStatus: copy.value.authNotConfigured,
        redirectingMagicLinkStatus: copy.value.authRedirectingMagicLink,
        redirectingProviderStatus: copy.value.authRedirectingProvider,
        startFailedStatus: copy.value.authStartFailed,
        closeLabel: copy.value.fragmentClose
      }}
    />
  )
})

export const onGet: RequestHandler = createCacheHandler(PRIVATE_REVALIDATE_CACHE)

export const LoginSkeleton = loginEnabled ? LoginFallbackSkeleton : StaticRouteSkeleton

export const head: DocumentHead = ({ resolveValue }: DocumentHeadProps) => {
  const data = resolveValue(useFragmentResource)
  const lang = data?.lang ?? defaultLang
  const copy = data?.languageSeed.ui
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
    links: buildFragmentCssLinks(data?.plan),
    htmlAttributes: {
      lang
    }
  }
}

const RouteComponent = loginEnabled ? EnabledLoginRoute : DisabledLoginRoute

export default component$(() => {
  const fragmentResource = useFragmentResource()
  const authFormState = useAuthFormState()
  useLanguageSeed(fragmentResource.value.lang, fragmentResource.value.languageSeed)
  const data = fragmentResource.value
  if (data.staticLogin) {
    return (
        <StaticLoginRoute
          copy={data.languageSeed.ui}
          lang={data.lang}
          initialFormState={authFormState.value}
        />
    )
  }
  if (data.staticRoute?.entries.length) {
    return (
      <StaticFragmentRoute
        model={data.staticRoute}
      />
    )
  }
  if (!loginEnabled) {
    return (
      <StaticPageRoot>
        <RouteComponent />
      </StaticPageRoot>
    )
  }
  return <RouteComponent />
})
