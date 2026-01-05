import { component$ } from '@builder.io/qwik'
import type { DocumentHead } from '@builder.io/qwik-city'
import { StaticRouteSkeleton, StaticRouteTemplate } from '@prometheus/ui'
import { useLangCopy } from 'apps/web/src/shared/lang-bridge'

export const LabRoute = component$(() => {
  const copy = useLangCopy()

  return (
    <StaticRouteTemplate
      metaLine={copy.value.labMetaLine}
      title={copy.value.labTitle}
      description={copy.value.labDescription}
      actionLabel={copy.value.labAction}
      closeLabel={copy.value.fragmentClose}
    />
  )
})

export const labHead: DocumentHead = {
  title: 'Lab | Fragment Prime',
  meta: [
    {
      name: 'description',
      content: 'Prototype new fragment systems and validate edge behaviors.'
    }
  ]
}

export const LabSkeleton = () => <StaticRouteSkeleton />

export default LabRoute
