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
      metaLine={copy.labMetaLine}
      title={copy.labTitle}
      description={copy.labDescription}
      actionLabel={copy.labAction}
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
