import { component$ } from '@builder.io/qwik'

type StaticRouteTemplateProps = {
  actionLabel: string
  description: string
  metaLine: string
  title: string
}

export const StaticRouteTemplate = component$<StaticRouteTemplateProps>(
  ({ actionLabel, description, metaLine, title }) => (
    <section class="fragment-shell">
      <div class="fragment-grid">
        <article class="fragment-card" style={{ gridColumn: 'span 12' }} data-motion>
          <div class="meta-line">{metaLine}</div>
          <h1>{title}</h1>
          <p>{description}</p>
          <button class="action-button" type="button">
            {actionLabel}
          </button>
        </article>
      </div>
    </section>
  )
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
