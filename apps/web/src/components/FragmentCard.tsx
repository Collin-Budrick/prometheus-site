import { $, component$, Slot, useSignal, useVisibleTask$, type Signal } from '@builder.io/qwik'
import { useLangCopy, useLangSignal } from '../shared/lang-bridge'

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
  layoutTick: Signal<number>
}

export const FragmentCard = component$<FragmentCardProps>(
  ({ id, fragmentId, column, motionDelay, expandedId, layoutTick }) => {
    const langSignal = useLangSignal()
    const copy = useLangCopy(langSignal)
    const cardRef = useSignal<HTMLElement>()
    const placeholderRef = useSignal<HTMLDivElement>()
    const lastExpanded = useSignal(expandedId.value === id)
    const lastLayoutTick = useSignal(layoutTick.value)
    const maxHeight = useSignal<number | null>(null)
    const lastWidth = useSignal<number | null>(null)

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
      const expanded = track(() => expandedId.value === id)
      const tick = track(() => layoutTick.value)
      const expandedChanged = expanded !== lastExpanded.value
      const resizeChanged = tick !== lastLayoutTick.value
      lastExpanded.value = expanded
      lastLayoutTick.value = tick

      const card = cardRef.value
      if (!card) return

      const placeholder = placeholderRef.value
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
          const current = activeAnimations.get(card)
          if (current) {
            current.cancel()
            activeAnimations.delete(card)
          }

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

          card.style.transformOrigin = 'top left'
          card.style.willChange = 'transform, border-radius'

          const isResizeFrame = resizeChanged && !expandedChanged
          const duration = isResizeFrame ? 220 : 550
          const easing = isResizeFrame ? 'linear' : 'cubic-bezier(0.22, 1, 0.36, 1)'
          const animation = card.animate(
            [
              {
                transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
                borderRadius: firstRadius
              },
              { transform: 'none', borderRadius: lastRadius }
            ],
            {
              duration,
              easing,
              fill: 'both'
            }
          )

          activeAnimations.set(card, animation)
          const finalize = () => {
            if (activeAnimations.get(card) !== animation) return
            activeAnimations.delete(card)
            card.style.transformOrigin = ''
            card.style.transform = ''
            card.style.borderRadius = ''
            card.style.willChange = ''
          }
          animation.addEventListener('finish', finalize, { once: true })
          animation.addEventListener('cancel', finalize, { once: true })
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

    useVisibleTask$(
      ({ track, cleanup }) => {
        track(() => langSignal.value)
        const card = cardRef.value
        if (!card) return
        let frame = requestAnimationFrame(() => {
          frame = 0
          if (expandedId.value === id) return
          const height = card.getBoundingClientRect().height
          if (height > 0) {
            maxHeight.value = Math.max(maxHeight.value ?? 0, height)
          }
        })
        cleanup(() => {
          if (frame) cancelAnimationFrame(frame)
        })
      },
      { strategy: 'document-ready' }
    )

    useVisibleTask$(
      ({ cleanup }) => {
        const card = cardRef.value
        if (!card || typeof ResizeObserver === 'undefined') return
        let resizeFrame: number | null = null
        const observer = new ResizeObserver((entries) => {
          if (expandedId.value === id) return
          const entry = entries[0]
          const width = entry?.contentRect.width ?? 0
          const height = entry?.contentRect.height ?? 0
          const previousWidth = lastWidth.value
          const widthChanged = typeof previousWidth === 'number' && Math.abs(previousWidth - width) > 1

          if (previousWidth === null) {
            lastWidth.value = width
            if (height > 0) {
              maxHeight.value = Math.max(maxHeight.value ?? 0, height)
            }
            return
          }

          if (widthChanged) {
            lastWidth.value = width
            maxHeight.value = null
            if (resizeFrame !== null) {
              cancelAnimationFrame(resizeFrame)
            }
            resizeFrame = requestAnimationFrame(() => {
              resizeFrame = null
              if (expandedId.value === id) return
              const nextHeight = card.getBoundingClientRect().height
              if (nextHeight > 0) {
                maxHeight.value = nextHeight
              }
            })
            return
          }

          if (height > 0) {
            maxHeight.value = Math.max(maxHeight.value ?? 0, height)
          }
        })
        observer.observe(card)
        cleanup(() => {
          observer.disconnect()
          if (resizeFrame !== null) {
            cancelAnimationFrame(resizeFrame)
          }
        })
      },
      { strategy: 'document-ready' }
    )

    const lockedHeight = maxHeight.value ? `${Math.ceil(maxHeight.value)}px` : undefined
    const cardStyle = {
      gridColumn: column,
      '--motion-delay': `${motionDelay}ms`,
      minHeight: lockedHeight
    } as Record<string, string>

    const placeholderStyle = {
      gridColumn: column,
      display: 'none',
      minHeight: lockedHeight
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
            <button
              class="fragment-card-close"
              type="button"
              aria-label={copy.value.fragmentClose}
              title={copy.value.fragmentClose}
              onClick$={handleClose}
            />
          ) : null}
        </article>
      </>
    )
  }
)
