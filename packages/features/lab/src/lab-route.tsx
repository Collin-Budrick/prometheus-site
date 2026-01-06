import { component$ } from '@builder.io/qwik'
import { StaticRouteSkeleton, StaticRouteTemplate } from '@prometheus/ui'

export type LabCopy = {
  metaLine: string
  title: string
  description: string
  actionLabel: string
  closeLabel: string
}

const defaultLabCopy: LabCopy = {
  metaLine: 'Labs',
  title: 'Lab',
  description: 'Prototype new fragment systems and validate edge behaviors.',
  actionLabel: 'Open lab',
  closeLabel: 'Close'
}

export const LabRoute = component$<{ copy?: Partial<LabCopy> }>(({ copy }) => {
  const resolvedCopy = { ...defaultLabCopy, ...copy }

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

export const LabSkeleton = () => <StaticRouteSkeleton />

export default LabRoute
