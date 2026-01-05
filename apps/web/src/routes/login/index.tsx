import { component$ } from '@builder.io/qwik'
import type { RequestHandler, DocumentHead } from '@builder.io/qwik-city'
import { StaticRouteSkeleton, StaticRouteTemplate } from '@prometheus/ui'
import { createCacheHandler, PRIVATE_NO_STORE_CACHE } from '../cache-headers'
import { useLangCopy } from '../../shared/lang-bridge'

export const onGet: RequestHandler = createCacheHandler(PRIVATE_NO_STORE_CACHE)

export default component$(() => {
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

export const head: DocumentHead = {
  title: 'Login | Fragment Prime',
  meta: [
    {
      name: 'description',
      content: 'Access your fragment workspace and deployment history.'
    }
  ]
}

export const skeleton = () => <StaticRouteSkeleton />
