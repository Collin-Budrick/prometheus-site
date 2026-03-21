import { component$ } from '@builder.io/qwik'
import { StaticRouteSkeleton, StaticRouteTemplate } from '@prometheus/ui'

export type LabCopy = {
  metaLine: string
  title: string
  description: string
  actionLabel: string
  closeLabel: string
}

export type LabStarterCard = {
  id: string
  title: string
  description: string
  status: string
}

const defaultLabCopy: LabCopy = {
  metaLine: 'Labs',
  title: 'Lab',
  description: 'Prototype new fragment systems and validate edge behaviors.',
  actionLabel: 'Open lab',
  closeLabel: 'Close'
}

export const LabRoute = component$<{
  copy?: Partial<LabCopy>
  starterCards?: readonly LabStarterCard[]
}>(({ copy, starterCards }) => {
  const resolvedCopy = { ...defaultLabCopy, ...copy }

  return (
    <StaticRouteTemplate
      metaLine={resolvedCopy.metaLine}
      title={resolvedCopy.title}
      description={resolvedCopy.description}
      actionLabel={resolvedCopy.actionLabel}
      closeLabel={resolvedCopy.closeLabel}
    >
      {starterCards?.length ? (
        <div class="lab-starter-grid" data-lab-starter-grid>
          {starterCards.map((card) => (
            <article key={card.id} class="lab-starter-card" data-lab-starter-card>
              <span class="lab-starter-status">{card.status}</span>
              <h2>{card.title}</h2>
              <p>{card.description}</p>
            </article>
          ))}
        </div>
      ) : null}
    </StaticRouteTemplate>
  )
})

export const LabSkeleton = () => <StaticRouteSkeleton />

export default LabRoute
