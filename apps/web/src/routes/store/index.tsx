import { component$ } from '@builder.io/qwik'
import type { RequestHandler, DocumentHead } from '@builder.io/qwik-city'
import { StaticRouteTemplate, StaticRouteSkeleton } from '../../components/StaticRouteTemplate'
import { createCacheHandler, PUBLIC_SWR_CACHE } from '../cache-headers'
import { useLangSignal } from '../../shared/lang-bridge'
import { getUiCopy } from '../../shared/ui-copy'

export const onGet: RequestHandler = createCacheHandler(PUBLIC_SWR_CACHE)

export default component$(() => {
  const langSignal = useLangSignal()
  const copy = getUiCopy(langSignal.value)

  return (
    <StaticRouteTemplate
      metaLine={copy.storeMetaLine}
      title={copy.storeTitle}
      description={copy.storeDescription}
      actionLabel={copy.storeAction}
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
