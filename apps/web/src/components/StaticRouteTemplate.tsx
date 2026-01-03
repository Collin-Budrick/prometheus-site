import { $, component$, useOnDocument, useSignal } from '@builder.io/qwik'
import { FragmentCard } from './FragmentCard'

type StaticRouteTemplateProps = {
  actionLabel: string
  description: string
  metaLine: string
  title: string
}

export const StaticRouteTemplate = component$<StaticRouteTemplateProps>(
  ({ actionLabel, description, metaLine, title }) => {
    const expandedId = useSignal<string | null>(null)
    const cardId = `static:${title}`

    useOnDocument(
      'keydown',
      $((event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          expandedId.value = null
        }
      })
    )

    return (
      <section class="fragment-shell">
        <div class="fragment-grid">
          <FragmentCard id={cardId} column="span 12" motionDelay={0} expandedId={expandedId}>
            <div class="meta-line">{metaLine}</div>
            <h1>{title}</h1>
            <p>{description}</p>
            <button class="action-button" type="button">
              {actionLabel}
            </button>
          </FragmentCard>
        </div>
      </section>
    )
  }
)

export const StaticRouteSkeleton = component$(() => (
  <section class="fragment-shell" aria-hidden="true">
    <div class="fragment-grid">
      <article class="fragment-card" style={{ gridColumn: 'span 12' }} data-motion>
        <span class="skeleton-line is-short" />
        <span class="skeleton-line is-medium" />
        <span class="skeleton-line is-long" />
        <span class="skeleton-line is-button" />
      </article>
    </div>
  </section>
))
