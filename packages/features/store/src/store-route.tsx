import { component$ } from '@builder.io/qwik'
import type { DocumentHead } from '@builder.io/qwik-city'
import { StaticRouteSkeleton, StaticRouteTemplate } from '@prometheus/ui'
import { useLangCopy } from 'apps/web/src/shared/lang-bridge'

export const StoreRoute = component$(() => {
  const copy = useLangCopy()

  return (
    <StaticRouteTemplate
      metaLine={copy.value.storeMetaLine}
      title={copy.value.storeTitle}
      description={copy.value.storeDescription}
      actionLabel={copy.value.storeAction}
      closeLabel={copy.value.fragmentClose}
    />
  )
})

export const storeHead: DocumentHead = {
  title: 'Store | Fragment Prime',
  meta: [
    {
      name: 'description',
      content: 'Browse curated modules, fragments, and templates.'
    }
  ]
}

export const StoreSkeleton = () => <StaticRouteSkeleton />

export default StoreRoute
