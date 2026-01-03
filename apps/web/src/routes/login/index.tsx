import { component$ } from '@builder.io/qwik'
import type { RequestHandler, DocumentHead } from '@builder.io/qwik-city'
import { StaticRouteTemplate, StaticRouteSkeleton } from '../../components/StaticRouteTemplate'
import { createCacheHandler, PRIVATE_NO_STORE_CACHE } from '../cache-headers'
import { useLangSignal } from '../../shared/lang-bridge'
import { getUiCopy } from '../../shared/ui-copy'

export const onGet: RequestHandler = createCacheHandler(PRIVATE_NO_STORE_CACHE)

export default component$(() => {
  const langSignal = useLangSignal()
  const copy = getUiCopy(langSignal.value)

  return (
    <StaticRouteTemplate
      metaLine={copy.loginMetaLine}
      title={copy.loginTitle}
      description={copy.loginDescription}
      actionLabel={copy.loginAction}
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
