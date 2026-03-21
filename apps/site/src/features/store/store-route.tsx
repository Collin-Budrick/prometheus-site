import { component$ } from '@builder.io/qwik'
import { StaticRouteSkeleton, StaticRouteTemplate } from '@prometheus/ui'

export type StoreCopy = {
  metaLine: string
  title: string
  description: string
  actionLabel: string
  closeLabel: string
}

const defaultStoreCopy: StoreCopy = {
  metaLine: 'Fragments Marketplace',
  title: 'Store',
  description: 'Browse curated modules, fragments, and templates.',
  actionLabel: 'Start exploring',
  closeLabel: 'Close'
}

export const StoreRoute = component$<{ copy?: Partial<StoreCopy> }>(({ copy }) => {
  const resolvedCopy = { ...defaultStoreCopy, ...copy }

  return (
    <StaticRouteTemplate
      metaLine={resolvedCopy.metaLine}
      title={resolvedCopy.title}
      description={resolvedCopy.description}
      actionLabel={resolvedCopy.actionLabel}
      closeLabel={resolvedCopy.closeLabel}
    />
  )
})

export const StoreSkeleton = () => <StaticRouteSkeleton />

export default StoreRoute
