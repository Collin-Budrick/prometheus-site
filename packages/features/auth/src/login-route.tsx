import { component$ } from '@builder.io/qwik'
import type { DocumentHead } from '@builder.io/qwik-city'
import { StaticRouteSkeleton, StaticRouteTemplate } from '@prometheus/ui'
import { siteBrand } from '@site/config'
import { useLangCopy } from '@site/shared/lang-bridge'

export const LoginRoute = component$(() => {
  const copy = useLangCopy()

  return (
    <StaticRouteTemplate
      metaLine={copy.value.loginMetaLine}
      title={copy.value.loginTitle}
      description={copy.value.loginDescription}
      actionLabel={copy.value.loginAction}
      closeLabel={copy.value.fragmentClose}
    />
  )
})

export const loginHead: DocumentHead = {
  title: `Login | ${siteBrand.name}`,
  meta: [
    {
      name: 'description',
      content: 'Access your workspace and deployment history.'
    }
  ]
}

export const LoginSkeleton = () => <StaticRouteSkeleton />

export default LoginRoute
