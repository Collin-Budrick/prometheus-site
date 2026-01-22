import { $, component$, Slot, useOnDocument, useSignal, useVisibleTask$, type PropFunction } from '@builder.io/qwik'
import { FragmentCard } from './FragmentCard'

type StaticRouteTemplateProps = {
  actionLabel: string
  actionDisabled?: boolean
  closeLabel: string
  description: string
  metaLine: string
  onAction$?: PropFunction<() => void | Promise<void>>
  title: string
  expandable?: boolean
  fullWidth?: boolean
  inlineSpan?: number
  size?: 'small' | 'big' | 'tall'
}

export const StaticRouteTemplate = component$<StaticRouteTemplateProps>(
  ({
    actionLabel,
    actionDisabled,
    closeLabel,
    description,
    metaLine,
    onAction$,
    title,
    expandable,
    fullWidth,
    inlineSpan,
    size
  }) => {
    const expandedId = useSignal<string | null>(null)
    const layoutTick = useSignal(0)
    const gridRef = useSignal<HTMLDivElement>()
    const cardId = `static:${title}`

    useOnDocument(
      'keydown',
      $((event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          expandedId.value = null
        }
      })
    )

    useVisibleTask$(
      (ctx) => {
        if (typeof window === 'undefined') return
        const grid = gridRef.value
        if (!grid || !('ResizeObserver' in window)) return
        let frame = 0
        let pending = false
        let lastWidth = 0
        let lastHeight = 0
        let ready = false

        const observer = new ResizeObserver((entries) => {
          const entry = entries[0]
          if (!entry) return
          const { width, height } = entry.contentRect
          if (!ready) {
            ready = true
            lastWidth = width
            lastHeight = height
            return
          }
          if (width === lastWidth && height === lastHeight) return
          lastWidth = width
          lastHeight = height
          pending = true
          if (frame) return
          frame = requestAnimationFrame(() => {
            frame = 0
            if (!pending) return
            pending = false
            layoutTick.value += 1
          })
        })

        observer.observe(grid)

        ctx.cleanup(() => {
          observer.disconnect()
          if (frame) cancelAnimationFrame(frame)
        })
      },
      { strategy: 'document-ready' }
    )

    return (
      <section class="fragment-shell">
        <div ref={gridRef} class="fragment-grid" data-fragment-grid="main">
          <FragmentCard
            id={cardId}
            column="span 12"
            motionDelay={0}
            expandedId={expandedId}
            layoutTick={layoutTick}
            closeLabel={closeLabel}
            expandable={expandable}
            fullWidth={fullWidth}
            inlineSpan={inlineSpan}
            size={size}
          >
            <div class="meta-line">{metaLine}</div>
            <h1>{title}</h1>
            <p>{description}</p>
            <Slot />
            <button class="action-button" type="button" disabled={actionDisabled} onClick$={onAction$}>
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
    <div class="fragment-grid" data-fragment-grid="main">
      <article class="fragment-card static-route-skeleton" style={{ gridColumn: 'span 12' }} data-motion>
        <span class="skeleton-line is-meta" />
        <span class="skeleton-line is-title" />
        <span class="skeleton-line is-description" />
        <span class="skeleton-line is-button" />
      </article>
    </div>
  </section>
))
