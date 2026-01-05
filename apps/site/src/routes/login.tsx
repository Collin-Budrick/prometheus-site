import { component$ } from '@builder.io/qwik'
import type { DocumentHead, RequestHandler } from '@builder.io/qwik-city'
import { StaticRouteSkeleton, StaticRouteTemplate } from '@prometheus/ui'
import { siteBrand, siteFeatures } from '../config'
import { createCacheHandler, PRIVATE_NO_STORE_CACHE } from './cache-headers'
import { useLangCopy } from '../shared/lang-bridge'
import { LoginRoute as FeatureLoginRoute, LoginSkeleton as FeatureLoginSkeleton } from '@features/auth/login-route'

const loginEnabled = siteFeatures.login !== false
const loginTitle = loginEnabled ? 'Login' : 'Feature disabled'
const loginDescription = loginEnabled
  ? 'Authenticate to manage fragments, releases, and workspace settings.'
  : 'This route is disabled in this site configuration.'

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
  return (
    <FeatureLoginRoute
      copy={{
        metaLine: copy.value.loginMetaLine,
        title: copy.value.loginTitle,
        description: copy.value.loginDescription,
        actionLabel: copy.value.loginAction,
        closeLabel: copy.value.fragmentClose
      }}
    />
  )
})

export const onGet: RequestHandler = createCacheHandler(PRIVATE_NO_STORE_CACHE)

export const LoginSkeleton = loginEnabled ? FeatureLoginSkeleton : StaticRouteSkeleton

export const head: DocumentHead = {
  title: `${loginTitle} | ${siteBrand.name}`,
  meta: [
    {
      name: 'description',
      content: loginDescription
    }
  ]
}

const RouteComponent = loginEnabled ? EnabledLoginRoute : DisabledLoginRoute

export default RouteComponent
