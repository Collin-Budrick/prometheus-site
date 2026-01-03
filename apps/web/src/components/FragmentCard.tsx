import { $, component$, Slot, useSignal, useVisibleTask$, type Signal } from '@builder.io/qwik'

const INTERACTIVE_SELECTOR =
  'a, button, input, textarea, select, option, [role="button"], [contenteditable="true"], [data-fragment-link]'

const previousRects = new WeakMap<HTMLElement, DOMRect>()
const previousRadii = new WeakMap<HTMLElement, string>()
const activeAnimations = new WeakMap<HTMLElement, Animation>()
const pendingRects = new WeakMap<HTMLElement, DOMRect>()
const pendingRadii = new WeakMap<HTMLElement, string>()

type FragmentCardProps = {
  id: string
  fragmentId?: string
  column: string
  motionDelay: number
  expandedId: Signal<string | null>
}

export const FragmentCard = component$<FragmentCardProps>(
  ({ id, fragmentId, column, motionDelay, expandedId }) => {
    const cardRef = useSignal<HTMLElement>()
    const placeholderRef = useSignal<HTMLDivElement>()

    const handleToggle = $((event: MouseEvent) => {
      if (!(event.target instanceof HTMLElement)) return
      if (event.target.closest(INTERACTIVE_SELECTOR)) return
      if (expandedId.value === id) return
      const card = cardRef.value
      if (card) {
        pendingRects.set(card, card.getBoundingClientRect())
        pendingRadii.set(card, window.getComputedStyle(card).borderRadius)
      }
      expandedId.value = expandedId.value === id ? null : id
    })

    const handleClose = $(() => {
      const card = cardRef.value
      if (card) {
        pendingRects.set(card, card.getBoundingClientRect())
        pendingRadii.set(card, window.getComputedStyle(card).borderRadius)
      }
      expandedId.value = null
    })

    useVisibleTask$(
      ({ track, cleanup }) => {
      track(() => expandedId.value === id)

      const card = cardRef.value
      if (!card) return

      const placeholder = placeholderRef.value
      const expanded = expandedId.value === id
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const computed = window.getComputedStyle(card)
      const pendingRect = pendingRects.get(card)
      const firstRect = pendingRect ?? previousRects.get(card)
      const firstRadius = pendingRadii.get(card) ?? previousRadii.get(card) ?? computed.borderRadius
      let cancelled = false

      cleanup(() => {
        cancelled = true
      })

      if (!firstRect) {
        previousRects.set(card, card.getBoundingClientRect())
        previousRadii.set(card, firstRadius)
        if (placeholder) {
          placeholder.style.display = 'none'
          placeholder.style.height = ''
          placeholder.style.width = ''
        }
        return
      }

      if (pendingRect) {
        pendingRects.delete(card)
        pendingRadii.delete(card)
      }

      if (placeholder) {
        if (expanded) {
          placeholder.style.display = ''
          placeholder.style.height = `${firstRect.height}px`
          placeholder.style.width = `${firstRect.width}px`
        } else {
          placeholder.style.display = 'none'
          placeholder.style.height = ''
          placeholder.style.width = ''
        }
      }

      queueMicrotask(() => {
        if (cancelled) return

        const run = () => {
          if (cancelled) return
          const lastRect = card.getBoundingClientRect()
          const lastRadius = window.getComputedStyle(card).borderRadius
          previousRects.set(card, lastRect)
          previousRadii.set(card, lastRadius)

          if (prefersReducedMotion) return

          const dx = firstRect.left - lastRect.left
          const dy = firstRect.top - lastRect.top
          const sx = firstRect.width / lastRect.width
          const sy = firstRect.height / lastRect.height

          if (!Number.isFinite(sx) || !Number.isFinite(sy)) return
          if (
            Math.abs(dx) < 0.5 &&
            Math.abs(dy) < 0.5 &&
            Math.abs(sx - 1) < 0.01 &&
            Math.abs(sy - 1) < 0.01 &&
            firstRadius === lastRadius
          ) {
            return
          }

          const current = activeAnimations.get(card)
          if (current) {
            current.cancel()
            activeAnimations.delete(card)
          }

          card.style.transformOrigin = 'top left'
          card.style.willChange = 'transform, border-radius'

          const animation = card.animate(
            [
              {
                transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
                borderRadius: firstRadius
              },
              { transform: 'none', borderRadius: lastRadius }
            ],
            {
              duration: 550,
              easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
              fill: 'both'
            }
          )

          activeAnimations.set(card, animation)
          animation.finished.finally(() => {
            if (activeAnimations.get(card) === animation) {
              activeAnimations.delete(card)
            }
            card.style.transformOrigin = ''
            card.style.transform = ''
            card.style.borderRadius = ''
            card.style.willChange = ''
          })
        }

        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(run)
        } else {
          setTimeout(run, 0)
        }
      })
      },
      { strategy: 'document-ready' }
    )

    const cardStyle = {
      gridColumn: column,
      '--motion-delay': `${motionDelay}ms`
    } as Record<string, string>

    const placeholderStyle = {
      gridColumn: column,
      display: 'none'
    } as Record<string, string>

    const isExpanded = expandedId.value === id

    return (
      <>
        <div ref={placeholderRef} class="fragment-card-placeholder" style={placeholderStyle} aria-hidden="true" />
        <article
          ref={cardRef}
          class={{ 'fragment-card': true, 'is-expanded': isExpanded }}
          style={cardStyle}
          data-motion
          data-fragment-id={fragmentId}
          onClick$={handleToggle}
        >
          <Slot />
          {isExpanded ? (
            <button class="fragment-card-close" type="button" aria-label="Close" title="Close" onClick$={handleClose} />
          ) : null}
        </article>
      </>
    )
  }
)
