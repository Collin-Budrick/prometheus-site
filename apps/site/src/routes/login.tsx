import { component$ } from '@builder.io/qwik'
import type { DocumentHead, RequestHandler } from '@builder.io/qwik-city'
import { StaticRouteSkeleton, StaticRouteTemplate } from '@prometheus/ui'
import { siteBrand, siteFeatures } from '../config'
import { createCacheHandler, PRIVATE_NO_STORE_CACHE } from './cache-headers'
import { useLangCopy } from '../shared/lang-bridge'
import { LoginRoute as FeatureLoginRoute, LoginSkeleton as FeatureLoginSkeleton } from '@features/auth'

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

const RouteComponent = loginEnabled ? FeatureLoginRoute : DisabledLoginRoute

export default RouteComponent
