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
      metaLine={copy.value.labMetaLine}
      title={copy.value.labTitle}
      description={copy.value.labDescription}
      actionLabel={copy.value.labAction}
    />
  )
})

export const head: DocumentHead = {
  title: 'Lab | Fragment Prime',
  meta: [
    {
      name: 'description',
      content: 'Prototype new fragment systems and validate edge behaviors.'
    }
  ]
}

export const skeleton = () => <StaticRouteSkeleton />
