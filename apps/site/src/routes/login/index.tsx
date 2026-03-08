import { component$ } from '@builder.io/qwik'
import { routeLoader$, useLocation, type DocumentHead, type DocumentHeadProps, type RequestHandler } from '@builder.io/qwik-city'
import { StaticRouteSkeleton, StaticRouteTemplate } from '@prometheus/ui'
import { siteBrand, siteFeatures } from '../../config'
import { createCacheHandler, PRIVATE_NO_STORE_CACHE } from '../cache-headers'
import { useLangCopy, useLanguageSeed } from '../../shared/lang-bridge'
import {
  FragmentShell,
  getFragmentShellCacheEntry,
  readFragmentShellStateFromCookie,
  type FragmentShellState
} from '../../fragment/ui'
import type { FragmentPayloadValue, FragmentPlanValue } from '../../fragment/types'
import { appConfig } from '../../app-config'
import { loadHybridFragmentResource, resolveRequestLang } from '../fragment-resource'
import { defaultLang, type Lang } from '../../shared/lang-store'
import { buildFragmentCssLinks } from '../../fragment/fragment-css'
import { loginLanguageSelection, withFragmentHeaderSelection, type LanguageSeedPayload } from '../../lang/selection'

const featureLoginModule = await import('@features/auth/pages/Login')
const { LoginRoute: FeatureLoginRoute, LoginSkeleton: FeatureLoginSkeleton, resolveAuthFormState } = featureLoginModule
type AuthFormState = import('@features/auth/pages/Login').AuthFormState

const loginEnabled = siteFeatures.login !== false
type FragmentResource = {
  plan: FragmentPlanValue | null
  fragments: FragmentPayloadValue
  path: string
  lang: Lang
  shellState: FragmentShellState | null
  languageSeed: LanguageSeedPayload
}

export const useAuthFormState = routeLoader$<AuthFormState>(({ request }) =>
  resolveAuthFormState(request.headers.get('cookie'))
)

export const useFragmentResource = routeLoader$<FragmentResource>(async ({ url, request }) => {
  const { createServerLanguageSeed } = await import('../../lang/server')
  const path = url.pathname || '/login'
  const lang = resolveRequestLang(request)
  if (!loginEnabled) {
    return {
      plan: null,
      fragments: {} as FragmentPayloadValue,
      path,
      lang,
      shellState: null,
      languageSeed: createServerLanguageSeed(lang, loginLanguageSelection)
    }
  }

  try {
    const { plan, fragments, path: planPath } = await loadHybridFragmentResource(path, appConfig, lang, request)
    const fragmentHeaderIds = plan.fragments.map((entry) => entry.id)
    return {
      plan,
      fragments: fragments as FragmentPayloadValue,
      path: planPath,
      lang,
      shellState: readFragmentShellStateFromCookie(request.headers.get('cookie'), planPath),
      languageSeed: createServerLanguageSeed(
        lang,
        withFragmentHeaderSelection(loginLanguageSelection, fragmentHeaderIds)
      )
    }
  } catch (error) {
    console.error('Fragment plan fetch failed for login', error)
    return {
      plan: null,
      fragments: {} as FragmentPayloadValue,
      path,
      lang,
      shellState: null,
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

const EnabledLoginRoute = component$(() => {
  const copy = useLangCopy()
  const authFormState = useAuthFormState()
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
        closeLabel: copy.value.fragmentClose
      }}
    />
  )
})

export const onGet: RequestHandler = createCacheHandler(PRIVATE_NO_STORE_CACHE)

export const LoginSkeleton = loginEnabled ? FeatureLoginSkeleton : StaticRouteSkeleton

export const head: DocumentHead = ({ resolveValue }: DocumentHeadProps) => {
  const data = resolveValue(useFragmentResource)
  const lang = data?.lang ?? defaultLang
  const copy = data?.languageSeed.ui
  const title = loginEnabled ? copy.loginTitle : 'Feature disabled'
  const description = loginEnabled
    ? copy.loginDescription
    : 'This route is disabled in this site configuration.'

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
  const location = useLocation()
  const fragmentResource = useFragmentResource()
  useLanguageSeed(fragmentResource.value.lang, fragmentResource.value.languageSeed)
  const cachedEntry = typeof window !== 'undefined' ? getFragmentShellCacheEntry(location.url.pathname) : undefined
  const cachedData = cachedEntry
    ? {
        plan: cachedEntry.plan,
        fragments: cachedEntry.fragments,
        path: cachedEntry.path,
        lang: cachedEntry.lang,
        shellState: null,
        languageSeed: fragmentResource.value.languageSeed
      }
    : null
  const data = fragmentResource.value ?? cachedData
  if (data?.plan?.fragments?.length) {
    return (
      <FragmentShell
        plan={data.plan}
        initialFragments={data.fragments}
        path={data.path}
        initialLang={data.lang}
        initialShellState={data.shellState ?? undefined}
      />
    )
  }
  return <RouteComponent />
})
