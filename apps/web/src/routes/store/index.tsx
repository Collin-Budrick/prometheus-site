import { component$ } from '@builder.io/qwik'
import type { RequestHandler, DocumentHead } from '@builder.io/qwik-city'
import { StaticRouteTemplate, StaticRouteSkeleton } from '../../components/StaticRouteTemplate'
import { createCacheHandler, PUBLIC_SWR_CACHE } from '../cache-headers'
import { useLangCopy } from '../../shared/lang-bridge'

export const onGet: RequestHandler = createCacheHandler(PUBLIC_SWR_CACHE)

export default component$(() => {
  const copy = useLangCopy()

  return (
    <StaticRouteTemplate
      metaLine={copy.value.storeMetaLine}
      title={copy.value.storeTitle}
      description={copy.value.storeDescription}
      actionLabel={copy.value.storeAction}
    />
  )
})

export const head: DocumentHead = {
  title: 'Store | Fragment Prime',
  meta: [
    {
      name: 'description',
      content: 'Browse curated modules, fragments, and templates.'
    }
  ]
}

export const skeleton = () => <StaticRouteSkeleton />
