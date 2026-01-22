import { component$ } from '@builder.io/qwik'
import { routeLoader$, useLocation, type DocumentHead, type DocumentHeadProps, type RequestHandler } from '@builder.io/qwik-city'
import { StaticRouteSkeleton, StaticRouteTemplate } from '@prometheus/ui'
import { siteBrand, siteFeatures } from '../../config'
import { createCacheHandler, PRIVATE_NO_STORE_CACHE } from '../cache-headers'
import { useLangCopy } from '../../shared/lang-bridge'
import { getUiCopy } from '../../shared/ui-copy'
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

const featureLoginModule = await import('@features/auth/pages/Login')
const { LoginRoute: FeatureLoginRoute, LoginSkeleton: FeatureLoginSkeleton, resolveAuthFormState } = featureLoginModule
type AuthFormState = import('@features/auth/pages/Login').AuthFormState

const loginEnabled = siteFeatures.login !== false
type FragmentResource = {
  plan: FragmentPlanValue
  fragments: FragmentPayloadValue
  path: string
  lang: Lang
  shellState: FragmentShellState | null
}

export const useAuthFormState = routeLoader$<AuthFormState>(({ request }) =>
  resolveAuthFormState(request.headers.get('cookie'))
)

export const useFragmentResource = routeLoader$<FragmentResource | null>(async ({ url, request }) => {
  const path = url.pathname || '/login'
  const lang = resolveRequestLang(request)

  try {
    const { plan, fragments, path: planPath } = await loadHybridFragmentResource(path, appConfig, lang, request)
    return {
      plan,
      fragments: fragments as FragmentPayloadValue,
      path: planPath,
      lang,
      shellState: readFragmentShellStateFromCookie(request.headers.get('cookie'), planPath)
    }
  } catch (error) {
    console.error('Fragment plan fetch failed for login', error)
    return null
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
  const copy = getUiCopy(lang)
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
    htmlAttributes: {
      lang
    }
  }
}

const RouteComponent = loginEnabled ? EnabledLoginRoute : DisabledLoginRoute

export default component$(() => {
  const location = useLocation()
  const fragmentResource = useFragmentResource()
  const cachedEntry = typeof window !== 'undefined' ? getFragmentShellCacheEntry(location.url.pathname) : undefined
  const cachedData = cachedEntry
    ? { plan: cachedEntry.plan, fragments: cachedEntry.fragments, path: cachedEntry.path, lang: cachedEntry.lang, shellState: null }
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
