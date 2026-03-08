import { $, component$, Slot, useSignal, useVisibleTask$, type Signal } from '@builder.io/qwik'

const INTERACTIVE_SELECTOR =
  'a, button, input, textarea, select, option, [role="button"], [contenteditable="true"], [data-fragment-link], [data-drag-handle]'

const previousRects = new WeakMap<HTMLElement, DOMRect>()
const previousRadii = new WeakMap<HTMLElement, string>()
const activeAnimations = new WeakMap<HTMLElement, Animation>()
const pendingRects = new WeakMap<HTMLElement, DOMRect>()
const pendingRadii = new WeakMap<HTMLElement, string>()
const INITIAL_TASKS_EVENT = 'prom:fragment-initial-tasks'
const STABLE_HEIGHT_EVENT = 'prom:fragment-stable-height'
const INITIAL_REVEAL_TIMEOUT_MS = 1800

type FragmentInitialStage =
  | 'waiting-payload'
  | 'waiting-css'
  | 'waiting-islands'
  | 'waiting-client-tasks'
  | 'waiting-assets'
  | 'ready'

export type FragmentCardProps = {
  id: string
  fragmentId?: string
  column: string
  motionDelay: number
  expandedId: Signal<string | null>
  layoutTick: Signal<number>
  closeLabel: string
  disableMotion?: boolean
  fragmentLoaded?: boolean
  fragmentHasCss?: boolean
  fragmentStage?: FragmentInitialStage
  reservedHeight?: number | null
  revealLocked?: boolean
  expandable?: boolean
  draggable?: boolean
  fullWidth?: boolean
  inlineSpan?: number
  size?: 'small' | 'big' | 'tall'
  variant?: 'card' | 'text'
  row?: string
  critical?: boolean
  dragState?: Signal<{
    active: boolean
    suppressUntil: number
    draggingId?: string | null
  } | null>
}

export const FragmentCard = component$<FragmentCardProps>((props) => {
  const {
    id,
    fragmentId,
    column,
    motionDelay,
    expandedId,
    layoutTick,
    closeLabel,
    disableMotion,
    expandable,
    draggable,
    fullWidth,
    inlineSpan,
    size,
    variant,
    row,
    critical,
    dragState
  } = props
    const isFullWidth = fullWidth === true
    const resolvedVariant = variant ?? 'card'
    const isDraggable = draggable !== false && Boolean(dragState)
    const waveIn = resolvedVariant === 'text' && !disableMotion
    const resolvedSize = size
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
    const layoutVersion = layoutTick.value
    const bodyRef = useSignal<HTMLDivElement>()
    const fragmentReady = useSignal(false)
    const currentStage = useSignal<FragmentInitialStage>(props.fragmentStage ?? 'waiting-payload')
    const revealLocked = useSignal(props.revealLocked !== false)
    const finalMeasuredHeight = useSignal<number | null>(null)
    const lockedHeight = useSignal<number | null>(props.reservedHeight ?? null)
    const hasSettledOnce = useSignal(false)
    const forceReveal = useSignal(false)
    const cssReady = useSignal(Boolean(props.fragmentLoaded && props.fragmentHasCss === false))
    const pendingTaskKeys = useSignal<string[]>([])
    const pendingTaskCount = useSignal(0)

    const handleToggle = $((event: MouseEvent) => {
      const dragInfo = dragState?.value
      if (dragInfo?.active) return
      if (dragInfo && dragInfo.suppressUntil > Date.now()) return
      const canExpand =
        expandable === true || (expandable !== false && autoExpandable.value) || expandedId.value === id
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
      const canExpand =
        expandable === true || (expandable !== false && autoExpandable.value) || expandedId.value === id
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
        const skipLayoutTick =
          resizeChanged && !expandedChanged && !pendingRect && !visibilityChanged && hasPreviousRect
        if (skipLayoutTick) return
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
      { strategy: 'document-idle' }
    )

    useVisibleTask$(
      (ctx) => {
        ctx.track(() => layoutTick.value)
        ctx.track(() => expandedId.value)
        const inView = ctx.track(() => isInView.value)
        const card = cardRef.value
        if (!card || !inView) return

        let frame = 0
        const updateOverflow = () => {
          frame = 0
          if (!resolvedSize || expandedId.value === id || expandable === false) {
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
      { strategy: 'document-idle' }
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
      { strategy: 'document-idle' }
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
      { strategy: 'document-idle' }
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
      { strategy: 'document-idle' }
    )

    useVisibleTask$(
      (ctx) => {
        const loaded = ctx.track(() => Boolean(props.fragmentLoaded))
        const hasCss = ctx.track(() => props.fragmentHasCss !== false)
        const activeId = ctx.track(() => props.fragmentId)
        if (!activeId) return
        if (!loaded) {
          cssReady.value = false
          return
        }
        if (!hasCss) {
          cssReady.value = true
          return
        }
        if (cssReady.value) return
        if (typeof document === 'undefined') return
        const escapeId =
          typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
            ? CSS.escape(activeId)
            : activeId.replace(/["\\]/g, '\\$&')
        const selector = `[data-fragment-css~="${escapeId}"]`
        const resolveCssNode = () =>
          document.querySelector<HTMLStyleElement | HTMLLinkElement>(
            `style${selector}, link${selector}`
          )
        let cleanupLink: (() => void) | null = null
        const checkCss = () => {
          const node = resolveCssNode()
          if (!node) return false
          if (node instanceof HTMLLinkElement) {
            if (node.rel === 'stylesheet' || node.sheet) {
              cssReady.value = true
              return true
            }
            const handle = () => {
              cssReady.value = true
            }
            node.addEventListener('load', handle, { once: true })
            node.addEventListener('error', handle, { once: true })
            cleanupLink = () => {
              node.removeEventListener('load', handle)
              node.removeEventListener('error', handle)
            }
            return true
          }
          cssReady.value = true
          return true
        }
        if (checkCss()) {
          ctx.cleanup(() => {
            cleanupLink?.()
          })
          return
        }
        const observer = new MutationObserver(() => {
          if (checkCss()) {
            observer.disconnect()
          }
        })
        observer.observe(document.head, { childList: true })
        ctx.cleanup(() => {
          observer.disconnect()
          cleanupLink?.()
        })
      },
      { strategy: 'document-ready' }
    )

    useVisibleTask$(
      (ctx) => {
        const card = cardRef.value
        if (!card) return
        const syncSnapshot = (event?: Event) => {
          const detail = (event as CustomEvent<{ pendingCount?: number; pendingKeys?: string[] }> | undefined)?.detail
          pendingTaskCount.value =
            typeof detail?.pendingCount === 'number' ? detail.pendingCount : Number(card.dataset.initialTaskCount ?? '0')
          pendingTaskKeys.value = Array.isArray(detail?.pendingKeys)
            ? detail.pendingKeys
            : (card.dataset.initialTaskKeys ?? '')
                .split('|')
                .filter((value) => value.length > 0)
        }
        syncSnapshot()
        card.addEventListener(INITIAL_TASKS_EVENT, syncSnapshot as EventListener)
        ctx.cleanup(() => {
          card.removeEventListener(INITIAL_TASKS_EVENT, syncSnapshot as EventListener)
        })
      },
      { strategy: 'document-ready' }
    )

    useVisibleTask$(
      (ctx) => {
        const loaded = ctx.track(() => Boolean(props.fragmentLoaded))
        const activeId = ctx.track(() => props.fragmentId)
        const settled = ctx.track(() => hasSettledOnce.value)
        if (!activeId || !loaded || settled) {
          forceReveal.value = false
          return
        }
        const timeoutId = window.setTimeout(() => {
          if (import.meta.env.DEV && pendingTaskKeys.value.length) {
            console.warn(
              `[fragment-card] forcing reveal for ${activeId}; pending initial tasks: ${pendingTaskKeys.value.join(', ')}`
            )
          }
          forceReveal.value = true
        }, INITIAL_REVEAL_TIMEOUT_MS)
        ctx.cleanup(() => {
          window.clearTimeout(timeoutId)
        })
      },
      { strategy: 'document-ready' }
    )

    useVisibleTask$(
      (ctx) => {
        const baseStage = ctx.track(() => props.fragmentStage ?? 'waiting-payload')
        const reservedHeight = ctx.track(() => props.reservedHeight ?? null)
        const loaded = ctx.track(() => Boolean(props.fragmentLoaded))
        const cssSettled = ctx.track(() => cssReady.value)
        const taskCount = ctx.track(() => pendingTaskCount.value)
        const taskKeys = ctx.track(() => pendingTaskKeys.value.join('|'))
        const forced = ctx.track(() => forceReveal.value)
        const settled = ctx.track(() => hasSettledOnce.value)
        const card = cardRef.value
        if (!card) return

        if (settled) {
          currentStage.value = 'ready'
          fragmentReady.value = true
          return
        }

        revealLocked.value = props.revealLocked !== false
        if (finalMeasuredHeight.value === null) {
          lockedHeight.value = reservedHeight
        }

        if (baseStage === 'waiting-payload' || !loaded) {
          currentStage.value = 'waiting-payload'
          fragmentReady.value = false
          return
        }

        if (!cssSettled && !forced) {
          currentStage.value = 'waiting-css'
          fragmentReady.value = false
          return
        }

        if (!forced && taskCount > 0) {
          currentStage.value = taskKeys.includes('island:') ? 'waiting-islands' : 'waiting-client-tasks'
          fragmentReady.value = false
          return
        }

        currentStage.value = forced ? 'ready' : 'waiting-assets'
        fragmentReady.value = false

        let cancelled = false
        let fadeTimer = 0
        const images = Array.from(card.querySelectorAll<HTMLImageElement>('img'))
        const pendingImages = forced
          ? []
          : images.filter((image) => !(image.complete && image.naturalWidth >= 0))
        const finalizeReveal = () => {
          if (cancelled) return
          const measured = Math.max(
            Math.ceil(card.scrollHeight),
            Math.ceil(card.getBoundingClientRect().height),
            reservedHeight ?? 0
          )
          finalMeasuredHeight.value = measured > 0 ? measured : reservedHeight
          lockedHeight.value = finalMeasuredHeight.value
          currentStage.value = 'ready'
          fragmentReady.value = true
          hasSettledOnce.value = true
          forceReveal.value = false
          card.dispatchEvent(
            new CustomEvent(STABLE_HEIGHT_EVENT, {
              bubbles: true,
              detail: { fragmentId: props.fragmentId, height: finalMeasuredHeight.value }
            })
          )
          fadeTimer = window.setTimeout(() => {
            revealLocked.value = false
            lockedHeight.value = null
          }, 240)
        }

        const waitForStableFrames = (remaining = 2, lastHeight = -1) => {
          if (cancelled) return
          requestAnimationFrame(() => {
            if (cancelled) return
            const nextHeight = Math.max(
              Math.ceil(card.scrollHeight),
              Math.ceil(card.getBoundingClientRect().height),
              reservedHeight ?? 0
            )
            if (lastHeight >= 0 && Math.abs(nextHeight - lastHeight) <= 1) {
              if (remaining <= 1) {
                finalizeReveal()
                return
              }
              waitForStableFrames(remaining - 1, nextHeight)
              return
            }
            waitForStableFrames(2, nextHeight)
          })
        }

        const waitForImages = () => {
          if (!pendingImages.length) {
            waitForStableFrames()
            return
          }
          let remaining = pendingImages.length
          const handleDone = () => {
            remaining -= 1
            if (remaining <= 0) {
              waitForStableFrames()
            }
          }
          pendingImages.forEach((image) => {
            image.addEventListener('load', handleDone, { once: true })
            image.addEventListener('error', handleDone, { once: true })
          })
          ctx.cleanup(() => {
            pendingImages.forEach((image) => {
              image.removeEventListener('load', handleDone)
              image.removeEventListener('error', handleDone)
            })
          })
        }

        waitForImages()

        ctx.cleanup(() => {
          cancelled = true
          if (fadeTimer) {
            window.clearTimeout(fadeTimer)
          }
        })
      },
      { strategy: 'document-ready' }
    )

    const resolvedRow = row
    const cardStyle = {
      gridColumn: resolvedColumn,
      gridRow: resolvedRow,
      '--motion-delay': `${motionDelay}ms`,
      '--layout-version': `${layoutVersion}`,
      ...(lockedHeight.value ? { height: `${lockedHeight.value}px` } : {})
    } as Record<string, string>

    const placeholderStyle = {
      gridColumn: resolvedColumn,
      gridRow: resolvedRow,
      display: 'none'
    } as Record<string, string>

    return (
      <>
        <div ref={placeholderRef} class="fragment-card-placeholder" style={placeholderStyle} aria-hidden="true" />
        <article
          ref={cardRef}
          class={{ 'fragment-card': true, 'is-expanded': isExpanded, 'is-inline': isInline }}
          style={cardStyle}
          data-motion={disableMotion ? undefined : ''}
          data-motion-skip-visible={disableMotion ? undefined : ''}
          data-variant={resolvedVariant === 'card' ? undefined : resolvedVariant}
          data-draggable={isDraggable ? undefined : 'false'}
          data-wave-in={waveIn ? '' : undefined}
          data-critical={critical ? 'true' : undefined}
          data-fragment-id={fragmentId}
          data-fragment-loaded={props.fragmentLoaded ? 'true' : undefined}
          data-fragment-ready={fragmentReady.value ? 'true' : undefined}
          data-fragment-stage={currentStage.value}
          data-reveal-locked={revealLocked.value ? 'true' : 'false'}
          onClick$={handleToggle}
        >
          {isDraggable ? <span class="fragment-card-drag" data-drag-handle aria-hidden="true" /> : null}
          <div ref={bodyRef} class="fragment-card-body">
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
          </div>
          {fragmentId ? (
            <div class="fragment-card-loader" aria-hidden="true">
              <div class="loader" />
            </div>
          ) : null}
        </article>
      </>
    )
})
