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
  layoutTick: Signal<number>
  closeLabel: string
  expandable?: boolean
  fullWidth?: boolean
  inlineSpan?: number
  size?: 'small' | 'big' | 'tall'
  row?: string
  dragState?: Signal<{
    active: boolean
    suppressUntil: number
    draggingId?: string | null
  } | null>
}

export const FragmentCard = component$<FragmentCardProps>(
  ({
    id,
    fragmentId,
    column,
    motionDelay,
    expandedId,
    layoutTick,
    closeLabel,
    expandable,
    fullWidth,
    inlineSpan,
    size,
    row,
    dragState
  }) => {
    const isFullWidth = fullWidth === true
    const resolvedSize = size ?? 'small'
    const resolvedInlineSpan =
      typeof inlineSpan === 'number' && Number.isFinite(inlineSpan) && inlineSpan > 0
        ? Math.min(12, Math.floor(inlineSpan))
        : null
    const columnValue =
      resolvedInlineSpan !== null ? (resolvedInlineSpan === 12 ? '1 / -1' : `span ${resolvedInlineSpan}`) : column
    const resolvedColumn = isFullWidth ? '1 / -1' : columnValue
    const parseSpan = (value: string | undefined) => {
      if (!value) return null
      if (value.includes('/ -1') || value.includes('/-1')) return 12
      const match = value.match(/span\s+(\d+)/)
      if (!match) return null
      const parsed = Number.parseInt(match[1] ?? '', 10)
      return Number.isFinite(parsed) ? parsed : null
    }
    const columnSpan = parseSpan(resolvedColumn)
    const isInline = !isFullWidth && (columnSpan === null ? true : columnSpan < 12)
    const cardRef = useSignal<HTMLElement>()
    const placeholderRef = useSignal<HTMLDivElement>()
    const autoExpandable = useSignal(false)
    const lastExpanded = useSignal(expandedId.value === id)
    const lastLayoutTick = useSignal(layoutTick.value)
    const lastInView = useSignal(true)
    const maxHeight = useSignal<number | null>(null)
    const lastWidth = useSignal<number | null>(null)
    const isInView = useSignal(typeof IntersectionObserver === 'undefined')
    const visibilityTick = useSignal(0)
    const isExpanded = expandedId.value === id

    const handleToggle = $((event: MouseEvent) => {
      const dragInfo = dragState?.value
      if (dragInfo?.active) return
      if (dragInfo && dragInfo.suppressUntil > Date.now()) return
      const canExpand = expandable === true || autoExpandable.value || expandedId.value === id
      if (!canExpand) return
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
      const dragInfo = dragState?.value
      if (dragInfo?.active) return
      if (dragInfo && dragInfo.suppressUntil > Date.now()) return
      const canExpand = expandable === true || autoExpandable.value || expandedId.value === id
      if (!canExpand) return
      const card = cardRef.value
      if (card) {
        pendingRects.set(card, card.getBoundingClientRect())
        pendingRadii.set(card, window.getComputedStyle(card).borderRadius)
      }
      expandedId.value = null
    })

    useVisibleTask$(
      (ctx) => {
        const expanded = ctx.track(() => expandedId.value === id)
        const tick = ctx.track(() => layoutTick.value)
        const inView = ctx.track(() => isInView.value)
        const dragInfo = dragState ? ctx.track(() => dragState.value) : null
        const isDragging = dragInfo?.active && dragInfo?.draggingId === id
        const visibilityChanged = inView !== lastInView.value
        const expandedChanged = expanded !== lastExpanded.value
        const resizeChanged = tick !== lastLayoutTick.value
        lastExpanded.value = expanded
        lastLayoutTick.value = tick
        lastInView.value = inView
        ctx.track(() => visibilityTick.value)

        const card = cardRef.value
        if (!card) return
        const placeholder = placeholderRef.value

        if (isDragging) {
          previousRects.set(card, card.getBoundingClientRect())
          previousRadii.set(card, window.getComputedStyle(card).borderRadius)
          if (placeholder) {
            placeholder.style.display = 'none'
            placeholder.style.height = ''
            placeholder.style.width = ''
          }
          return
        }

        if (!inView) {
          const current = activeAnimations.get(card)
          if (current) {
            current.cancel()
            activeAnimations.delete(card)
          }
          return
        }

        const pendingRect = pendingRects.get(card)
        const hasPreviousRect = previousRects.has(card)
        const shouldMeasure =
          expandedChanged || Boolean(pendingRect) || !hasPreviousRect || visibilityChanged || resizeChanged

        if (!shouldMeasure) return

        if (visibilityChanged && !expandedChanged && !pendingRect) {
          previousRects.set(card, card.getBoundingClientRect())
          previousRadii.set(card, window.getComputedStyle(card).borderRadius)
          if (placeholder) {
            placeholder.style.display = 'none'
            placeholder.style.height = ''
            placeholder.style.width = ''
          }
          return
        }

        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const firstRect = pendingRect ?? previousRects.get(card)
        const storedRadius = pendingRadii.get(card) ?? previousRadii.get(card)
        const firstRadius = storedRadius ?? window.getComputedStyle(card).borderRadius
        let cancelled = false

        ctx.cleanup(() => {
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
          if (cancelled || !isInView.value) return

          const run = () => {
            if (cancelled || !isInView.value) return
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
            const handleFinish = () => {
              finalize()
              animation.cancel()
            }
            animation.addEventListener('finish', handleFinish, { once: true })
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
      (ctx) => {
        ctx.track(() => layoutTick.value)
        ctx.track(() => expandedId.value)
        const card = cardRef.value
        if (!card) return

        let frame = 0
        const updateOverflow = () => {
          frame = 0
          if (!resolvedSize || expandedId.value === id) {
            autoExpandable.value = expandedId.value === id
            return
          }
          const heightOverflow = card.scrollHeight - card.clientHeight
          const widthOverflow = card.scrollWidth - card.clientWidth
          autoExpandable.value = heightOverflow > 1 || widthOverflow > 1
        }

        const schedule = () => {
          if (frame) return
          frame = requestAnimationFrame(updateOverflow)
        }

        updateOverflow()

        const mutationObserver =
          typeof MutationObserver !== 'undefined'
            ? new MutationObserver(() => {
                schedule()
              })
            : null

        if (mutationObserver) {
          mutationObserver.observe(card, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true
          })
        }

        const resizeObserver =
          typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(() => {
                schedule()
              })
            : null

        if (resizeObserver) {
          resizeObserver.observe(card)
        }

        ctx.cleanup(() => {
          if (frame) cancelAnimationFrame(frame)
          mutationObserver?.disconnect()
          resizeObserver?.disconnect()
        })
      },
      { strategy: 'document-ready' }
    )

    useVisibleTask$(
      (ctx) => {
        const inView = ctx.track(() => isInView.value)
        if (!inView || typeof ResizeObserver !== 'undefined') return
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
        ctx.cleanup(() => {
          if (frame) cancelAnimationFrame(frame)
        })
      },
      { strategy: 'document-ready' }
    )

    useVisibleTask$(
      (ctx) => {
        const inView = ctx.track(() => isInView.value)
        if (!inView) return
        const card = cardRef.value
        if (!card || typeof ResizeObserver === 'undefined') return
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
            maxHeight.value = height > 0 ? height : null
            return
          }

          if (height > 0) {
            maxHeight.value = Math.max(maxHeight.value ?? 0, height)
          }
        })
        observer.observe(card)
        ctx.cleanup(() => {
          observer.disconnect()
        })
      },
      { strategy: 'document-ready' }
    )

    useVisibleTask$(
      (ctx) => {
        const card = cardRef.value
        if (!card) return
        if (typeof IntersectionObserver === 'undefined') {
          isInView.value = true
          return
        }

        const observer = new IntersectionObserver(
          (entries) => {
            const entry = entries[0]
            const intersecting = Boolean(entry?.isIntersecting)
            isInView.value = intersecting

            if (!intersecting) {
              const current = activeAnimations.get(card)
              if (current) {
                current.cancel()
                activeAnimations.delete(card)
              }
              return
            }

            visibilityTick.value++
          },
          { rootMargin: '20% 0px' }
        )

        observer.observe(card)
        ctx.cleanup(() => {
          observer.disconnect()
        })
      },
      { strategy: 'document-ready' }
    )

    const sizeHeight =
      resolvedSize === 'small'
        ? 'var(--fragment-card-small-height)'
        : resolvedSize === 'big'
          ? 'var(--fragment-card-big-height)'
          : resolvedSize === 'tall'
            ? 'var(--fragment-card-tall-height)'
            : undefined
    const lockedHeight = sizeHeight ?? (maxHeight.value ? `${Math.ceil(maxHeight.value)}px` : undefined)
    const resolvedRow = row ?? (resolvedSize === 'tall' ? 'span 2' : undefined)
    const cardStyle = {
      gridColumn: resolvedColumn,
      gridRow: resolvedRow,
      '--motion-delay': `${motionDelay}ms`,
      minHeight: sizeHeight ? undefined : lockedHeight
    } as Record<string, string>

    const placeholderStyle = {
      gridColumn: resolvedColumn,
      gridRow: resolvedRow,
      display: 'none',
      minHeight: lockedHeight
    } as Record<string, string>

    return (
      <>
        <div ref={placeholderRef} class="fragment-card-placeholder" style={placeholderStyle} aria-hidden="true" />
        <article
          ref={cardRef}
          class={{ 'fragment-card': true, 'is-expanded': isExpanded, 'is-inline': isInline }}
          style={cardStyle}
          data-size={resolvedSize}
          data-motion
          data-motion-skip-visible
          data-fragment-id={fragmentId}
          onClick$={handleToggle}
        >
          <Slot />
          {isExpanded ? (
            <button
              class="fragment-card-close"
              type="button"
              aria-label={closeLabel}
              title={closeLabel}
              onClick$={handleClose}
            />
          ) : null}
        </article>
      </>
    )
  }
)
