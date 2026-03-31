import { $, component$, Slot, useSignal, useVisibleTask$, type Signal } from '@builder.io/qwik'
import {
  getFragmentHeightViewport,
  persistFragmentHeight,
  readFragmentHeightCookieHeights,
  readFragmentStableHeight,
  resolveFragmentHeightWidthBucket,
  resolveReservedFragmentHeight,
  serializeFragmentHeightLayout,
  type FragmentHeightLayout,
  type FragmentHeightPersistenceContext
} from './fragment-height'
import {
  applyImmediateReadyStagger,
  clearReadyStaggerObserverForElement,
  queueReadyStaggerOnVisible,
  scheduleReleaseQueuedReadyStaggerWithin,
  shouldSkipReadyStagger
} from '../ready-stagger'
import {
  resolveFragmentCardRevealDecision,
  resolveFragmentCardUnlockDelay,
  type FragmentCardRevealPhase
} from './fragment-card-reveal'

const INTERACTIVE_SELECTOR =
  'a, button, input, textarea, select, option, [role="button"], [contenteditable="true"], [data-fragment-link], [data-drag-handle]'

const previousRects = new WeakMap<HTMLElement, DOMRect>()
const previousRadii = new WeakMap<HTMLElement, string>()
const activeAnimations = new WeakMap<HTMLElement, Animation>()
const pendingRects = new WeakMap<HTMLElement, DOMRect>()
const pendingRadii = new WeakMap<HTMLElement, string>()
const sharedVisibilityListeners = new Map<HTMLElement, Set<(visible: boolean) => void>>()
const readyFragmentCssIds = new Set<string>()
const fragmentCssReadyListeners = new Map<string, Set<() => void>>()
let sharedVisibilityObserver: IntersectionObserver | null = null
let sharedFragmentCssObserver: MutationObserver | null = null
const INITIAL_TASKS_EVENT = 'prom:fragment-initial-tasks'
const STABLE_HEIGHT_EVENT = 'prom:fragment-stable-height'
const INITIAL_REVEAL_TIMEOUT_MS = 1800
const FRAGMENT_CARD_QUEUED_READY_SELECTOR = '.fragment-card[data-ready-stagger-state="queued"]'

const resolveFragmentCardReadyStaggerRoot = (card: HTMLElement) =>
  card.closest<HTMLElement>('[data-static-home-root], [data-static-fragment-root], [data-fragment-grid]') ??
  card.ownerDocument ??
  (typeof document !== 'undefined' ? document : null)

const getSharedVisibilityObserver = () => {
  if (sharedVisibilityObserver || typeof IntersectionObserver === 'undefined') {
    return sharedVisibilityObserver
  }

  sharedVisibilityObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const listeners = sharedVisibilityListeners.get(entry.target as HTMLElement)
        if (!listeners?.size) return
        const visible = Boolean(entry.isIntersecting)
        listeners.forEach((listener) => {
          listener(visible)
        })
      })
    },
    { rootMargin: '20% 0px' }
  )

  return sharedVisibilityObserver
}

const observeCardVisibility = (element: HTMLElement, listener: (visible: boolean) => void) => {
  const observer = getSharedVisibilityObserver()
  if (!observer) {
    listener(true)
    return () => {}
  }

  let listeners = sharedVisibilityListeners.get(element)
  if (!listeners) {
    listeners = new Set()
    sharedVisibilityListeners.set(element, listeners)
    observer.observe(element)
  }

  listeners.add(listener)

  return () => {
    const active = sharedVisibilityListeners.get(element)
    if (!active) return
    active.delete(listener)
    if (active.size) return
    sharedVisibilityListeners.delete(element)
    observer.unobserve(element)
  }
}

const markFragmentCssReady = (fragmentId: string) => {
  const normalizedId = fragmentId.trim()
  if (!normalizedId) return
  readyFragmentCssIds.add(normalizedId)
  const listeners = fragmentCssReadyListeners.get(normalizedId)
  if (!listeners?.size) return
  fragmentCssReadyListeners.delete(normalizedId)
  listeners.forEach((listener) => {
    listener()
  })
}

const scanFragmentCssNodes = (root: ParentNode) => {
  const consumeNode = (node: Element) => {
    const ids = node.getAttribute('data-fragment-css')
    if (!ids) return
    ids
      .split(/\s+/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .forEach((value) => {
        markFragmentCssReady(value)
      })
  }

  if (root instanceof Element && root.hasAttribute('data-fragment-css')) {
    consumeNode(root)
  }

  root.querySelectorAll?.('[data-fragment-css]').forEach((node) => {
    consumeNode(node)
  })
}

const ensureFragmentCssObserver = () => {
  if (sharedFragmentCssObserver || typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return
  }

  scanFragmentCssNodes(document.head)

  sharedFragmentCssObserver = new MutationObserver((records) => {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (node instanceof Element) {
          scanFragmentCssNodes(node)
        }
      })
    })
  })

  sharedFragmentCssObserver.observe(document.head, { childList: true, subtree: true })
}

const isFragmentCssReady = (fragmentId: string) => {
  const normalizedId = fragmentId.trim()
  if (!normalizedId) return false
  if (readyFragmentCssIds.has(normalizedId)) return true
  if (typeof document === 'undefined') return false
  const escapeId =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(normalizedId)
      : normalizedId.replace(/["\\]/g, '\\$&')
  const selector = `[data-fragment-css~="${escapeId}"]`
  const ready = Boolean(document.querySelector(`style${selector}, link${selector}`))
  if (ready) {
    markFragmentCssReady(normalizedId)
  }
  return ready
}

const waitForFragmentCssReady = (fragmentId: string, listener: () => void) => {
  const normalizedId = fragmentId.trim()
  if (!normalizedId) {
    listener()
    return () => {}
  }

  ensureFragmentCssObserver()
  if (isFragmentCssReady(normalizedId)) {
    listener()
    return () => {}
  }

  let listeners = fragmentCssReadyListeners.get(normalizedId)
  if (!listeners) {
    listeners = new Set()
    fragmentCssReadyListeners.set(normalizedId, listeners)
  }
  listeners.add(listener)

  return () => {
    const active = fragmentCssReadyListeners.get(normalizedId)
    if (!active) return
    active.delete(listener)
    if (active.size) return
    fragmentCssReadyListeners.delete(normalizedId)
  }
}

const resolveCardWidth = (element: HTMLElement) => {
  const rect = Math.ceil(element.getBoundingClientRect().width)
  return rect > 0 ? rect : null
}

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
  fragmentHeightLayout?: FragmentHeightLayout | null
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
  fragmentHeightPersistence?: FragmentHeightPersistenceContext | null
}

type FragmentCardOverflowEffectsProps = {
  id: string
  expandable?: boolean
  resolvedSize?: 'small' | 'big' | 'tall'
  cardRef: Signal<HTMLElement | undefined>
  isInView: Signal<boolean>
  layoutTick: Signal<number>
  expandedId: Signal<string | null>
  autoExpandable: Signal<boolean>
}

const FragmentCardOverflowEffects = component$<FragmentCardOverflowEffectsProps>((props) => {
  const { id, expandable, resolvedSize, cardRef, isInView, layoutTick, expandedId, autoExpandable } = props

  useVisibleTask$(
    (ctx) => {
      ctx.track(() => layoutTick.value)
      ctx.track(() => expandedId.value)
      const inView = ctx.track(() => isInView.value)
      const card = cardRef.value
      if (!card || !inView) return

      let frame = requestAnimationFrame(() => {
        frame = 0
        if (!resolvedSize || expandedId.value === id || expandable === false) {
          autoExpandable.value = expandedId.value === id
          return
        }
        const heightOverflow = card.scrollHeight - card.clientHeight
        const widthOverflow = card.scrollWidth - card.clientWidth
        autoExpandable.value = heightOverflow > 1 || widthOverflow > 1
      })

      ctx.cleanup(() => {
        if (frame) cancelAnimationFrame(frame)
      })
    },
    { strategy: 'document-idle' }
  )

  return null
})

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
    const isInView = useSignal(typeof IntersectionObserver === 'undefined')
    const visibilityTick = useSignal(0)
    const isExpanded = expandedId.value === id
    const canToggleExpand = expandable === true || (expandable !== false && autoExpandable.value) || isExpanded
    const layoutVersion = layoutTick.value
    const bodyRef = useSignal<HTMLDivElement>()
    const fragmentReady = useSignal(false)
    const currentStage = useSignal<FragmentInitialStage>(props.fragmentStage ?? 'waiting-payload')
    const revealLocked = useSignal(props.revealLocked !== false)
    const finalMeasuredHeight = useSignal<number | null>(null)
    const lockedHeight = useSignal<number | null>(props.reservedHeight ?? null)
    const resolvedHeightHint = useSignal<number | null>(props.reservedHeight ?? null)
    const hasSettledOnce = useSignal(false)
    const forceReveal = useSignal(false)
    const cssReady = useSignal(Boolean(props.fragmentLoaded && props.fragmentHasCss === false))
    const pendingTaskKeys = useSignal<string[]>([])
    const pendingTaskCount = useSignal(0)
    const revealScheduled = useSignal(false)
    const readyStaggerState = useSignal<'queued' | 'done' | undefined>(undefined)
    const readyStaggerDelay = useSignal('0ms')
    const readyStaggerApplied = useSignal(false)
    const revealPhase = useSignal<FragmentCardRevealPhase>(fragmentId ? 'holding' : 'visible')
    const revealUnlockDelayMs = useSignal<number | null>(null)

    const handleToggle = $((event: MouseEvent) => {
      const dragInfo = dragState?.value
      if (dragInfo?.active) return
      if (dragInfo && dragInfo.suppressUntil > Date.now()) return
      const canExpand = canToggleExpand
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
      layoutTick.value += 1
    })

    const handleClose = $(() => {
      const dragInfo = dragState?.value
      if (dragInfo?.active) return
      if (dragInfo && dragInfo.suppressUntil > Date.now()) return
      const canExpand = canToggleExpand
      if (!canExpand) return
      const card = cardRef.value
      if (card) {
        pendingRects.set(card, card.getBoundingClientRect())
        pendingRadii.set(card, window.getComputedStyle(card).borderRadius)
      }
      expandedId.value = null
      layoutTick.value += 1
    })

    useVisibleTask$(
      (ctx) => {
        if (disableMotion) return
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
        const card = cardRef.value
        if (!card) return
        if (disableMotion) {
          isInView.value = true
          return
        }
        if (typeof IntersectionObserver === 'undefined') {
          isInView.value = true
          return
        }
        const cleanupObserver = observeCardVisibility(card, (intersecting) => {
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
        })
        ctx.cleanup(() => {
          cleanupObserver()
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
        if (isFragmentCssReady(activeId)) {
          cssReady.value = true
          return
        }
        const cleanupCssWait = waitForFragmentCssReady(activeId, () => {
          cssReady.value = true
        })
        ctx.cleanup(() => {
          cleanupCssWait()
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
        const fragmentId = ctx.track(() => props.fragmentId)
        const reservedHeight = ctx.track(() => props.reservedHeight ?? null)
        const settled = ctx.track(() => hasSettledOnce.value)
        const persistence = ctx.track(() => props.fragmentHeightPersistence ?? null)
        ctx.track(() => serializeFragmentHeightLayout(props.fragmentHeightLayout ?? null))
        const card = cardRef.value
        const layout = props.fragmentHeightLayout
        if (!card || !fragmentId || !persistence || !layout || settled) return

        let canceled = false
        let observer: ResizeObserver | null = null
        let lastBucket = ''

        const applyLearnedReservedHeight = () => {
          if (canceled) return
          const cardWidth = resolveCardWidth(card)
          const viewport = getFragmentHeightViewport(cardWidth ?? undefined)
          const widthBucket =
            resolveFragmentHeightWidthBucket({
              layout,
              viewport,
              cardWidth
            }) ?? ''
          if (widthBucket === lastBucket && resolvedHeightHint.value !== null) {
            return
          }
          lastBucket = widthBucket

          const stableHeight = readFragmentStableHeight({
            fragmentId,
            path: persistence.path,
            lang: persistence.lang,
            viewport,
            planSignature: persistence.planSignature,
            versionSignature: persistence.versionSignature,
            widthBucket
          })
          const cookieHeights =
            typeof document !== 'undefined'
              ? readFragmentHeightCookieHeights(document.cookie, {
                  path: persistence.path,
                  lang: persistence.lang,
                  viewport,
                  planSignature: persistence.planSignature,
                  versionSignature: persistence.versionSignature,
                  widthBucket
                })
              : null
          const cookieHeight =
            persistence.planIndex >= 0 ? cookieHeights?.[persistence.planIndex] ?? null : null
          const nextReservedHeight = resolveReservedFragmentHeight({
            layout,
            viewport,
            cardWidth,
            cookieHeight,
            stableHeight
          })

          if (nextReservedHeight <= 0) return
          if ((resolvedHeightHint.value ?? reservedHeight ?? 0) >= nextReservedHeight) return
          resolvedHeightHint.value = nextReservedHeight
          if (finalMeasuredHeight.value === null) {
            lockedHeight.value = Math.max(lockedHeight.value ?? 0, nextReservedHeight)
          }
        }

        applyLearnedReservedHeight()

        if (typeof ResizeObserver === 'undefined') {
          return
        }

        observer = new ResizeObserver(() => {
          if (hasSettledOnce.value) return
          applyLearnedReservedHeight()
        })
        observer.observe(card)

        ctx.cleanup(() => {
          canceled = true
          observer?.disconnect()
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
        const activeId = ctx.track(() => props.fragmentId)
        const ready = ctx.track(() => fragmentReady.value)
        const inView = ctx.track(() => isInView.value)
        const settled = ctx.track(() => hasSettledOnce.value)
        const card = cardRef.value
        if (!activeId || !ready || !inView || !settled || readyStaggerApplied.value || !card) return

        readyStaggerApplied.value = true
        const immediateReveal = disableMotion || critical || shouldSkipReadyStagger()

        if (immediateReveal) {
          applyImmediateReadyStagger(card, (state, delayMs) => {
            readyStaggerState.value = state
            readyStaggerDelay.value = `${delayMs}ms`
            revealPhase.value = state === 'done' ? 'visible' : 'queued'
          })
          revealUnlockDelayMs.value = 0
          return
        }

        queueReadyStaggerOnVisible(card, {
          group: 'fragment-ready',
          replay: true,
          onStateChange: (state, delayMs) => {
            readyStaggerState.value = state
            readyStaggerDelay.value = `${delayMs}ms`
            revealPhase.value = state === 'done' ? 'visible' : 'queued'
            if (state === 'done') {
              revealUnlockDelayMs.value = resolveFragmentCardUnlockDelay({ delayMs })
            }
          }
        })
        scheduleReleaseQueuedReadyStaggerWithin({
          root: resolveFragmentCardReadyStaggerRoot(card) ?? undefined,
          queuedSelector: FRAGMENT_CARD_QUEUED_READY_SELECTOR,
          group: 'fragment-ready'
        })

        ctx.cleanup(() => {
          clearReadyStaggerObserverForElement(card)
        })
      },
      { strategy: 'document-idle' }
    )

    useVisibleTask$(
      (ctx) => {
        const inView = ctx.track(() => isInView.value)
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

        const revealDecision = resolveFragmentCardRevealDecision({
          baseStage,
          loaded,
          inView,
          cssSettled,
          taskCount,
          taskKeys,
          forced,
          settled,
          revealPhase: revealPhase.value
        })

        currentStage.value = revealDecision.stage
        fragmentReady.value = revealDecision.fragmentReady

        if (settled) {
          revealScheduled.value = false
          return
        }

        revealLocked.value = props.revealLocked !== false
        if (finalMeasuredHeight.value === null) {
          lockedHeight.value = reservedHeight
          resolvedHeightHint.value = reservedHeight
        }
        revealPhase.value = revealDecision.revealPhase

        if (!revealDecision.shouldWaitForAssets) {
          readyStaggerState.value = undefined
          readyStaggerDelay.value = '0ms'
          revealUnlockDelayMs.value = null
          readyStaggerApplied.value = false
          revealScheduled.value = false
          return
        }

        let cancelled = false
        let revealFrame = 0
        let revealFrameTwo = 0
        const images = Array.from(card.querySelectorAll<HTMLImageElement>('img'))
        const pendingImages = forced
          ? []
          : images.filter((image) => !(image.complete && image.naturalWidth >= 0))
        const finalizeReveal = () => {
          if (cancelled) return
          const previousReservedHeight = resolvedHeightHint.value ?? reservedHeight ?? 0
          const measured = Math.max(
            Math.ceil(card.scrollHeight),
            Math.ceil(card.getBoundingClientRect().height),
            reservedHeight ?? 0
          )
          finalMeasuredHeight.value = measured > 0 ? measured : reservedHeight
          lockedHeight.value = finalMeasuredHeight.value
          resolvedHeightHint.value = finalMeasuredHeight.value
          if (revealScheduled.value) return
          revealScheduled.value = true
          revealFrame = requestAnimationFrame(() => {
            if (cancelled) return
            revealFrameTwo = requestAnimationFrame(() => {
              if (cancelled) return
              currentStage.value = 'ready'
              fragmentReady.value = true
              hasSettledOnce.value = true
              forceReveal.value = false
              revealScheduled.value = false
              revealPhase.value = 'holding'
              const settledHeight = finalMeasuredHeight.value
              if (settledHeight === null) {
                return
              }
              const cardWidth = resolveCardWidth(card)
              const widthBucket = props.fragmentHeightLayout
                ? resolveFragmentHeightWidthBucket({
                    layout: props.fragmentHeightLayout,
                    viewport: getFragmentHeightViewport(cardWidth ?? undefined),
                    cardWidth
                  })
                : null
              if (props.fragmentId) {
                persistFragmentHeight({
                  fragmentId: props.fragmentId,
                  height: settledHeight,
                  context: props.fragmentHeightPersistence,
                  widthBucket
                })
              }
              if (props.fragmentId && settledHeight > previousReservedHeight) {
                card.dispatchEvent(
                  new CustomEvent('prom:fragment-height-miss', {
                    bubbles: true,
                    detail: {
                      fragmentId: props.fragmentId,
                      reservedHeight: previousReservedHeight,
                      height: settledHeight,
                      widthBucket
                    }
                  })
                )
              }
              card.dispatchEvent(
                new CustomEvent(STABLE_HEIGHT_EVENT, {
                  bubbles: true,
                  detail: { fragmentId: props.fragmentId, height: settledHeight }
                })
              )
            })
          })
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
          revealScheduled.value = false
          if (revealFrame) {
            cancelAnimationFrame(revealFrame)
          }
          if (revealFrameTwo) {
            cancelAnimationFrame(revealFrameTwo)
          }
        })
      },
      { strategy: 'document-idle' }
    )

    useVisibleTask$(
      (ctx) => {
        const activeId = ctx.track(() => props.fragmentId)
        const phase = ctx.track(() => revealPhase.value)
        const unlockDelayMs = ctx.track(() => revealUnlockDelayMs.value)
        const locked = ctx.track(() => revealLocked.value)

        if (!activeId || phase !== 'visible' || unlockDelayMs === null || !locked) {
          return
        }

        let unlockFrame = 0
        let unlockTimer = 0
        const unlock = () => {
          revealLocked.value = false
          lockedHeight.value = null
          revealUnlockDelayMs.value = null
        }

        if (unlockDelayMs <= 0) {
          if (typeof requestAnimationFrame === 'function') {
            unlockFrame = requestAnimationFrame(() => {
              unlockFrame = 0
              unlock()
            })
          } else {
            unlock()
          }
        } else {
          unlockTimer = window.setTimeout(unlock, unlockDelayMs)
        }

        ctx.cleanup(() => {
          if (unlockFrame) {
            cancelAnimationFrame(unlockFrame)
          }
          if (unlockTimer) {
            window.clearTimeout(unlockTimer)
          }
        })
      },
      { strategy: 'document-idle' }
    )

    const resolvedRow = row
    const cardStyle = {
      gridColumn: resolvedColumn,
      gridRow: resolvedRow,
      '--motion-delay': `${motionDelay}ms`,
      '--ready-stagger-delay': readyStaggerDelay.value,
      '--layout-version': `${layoutVersion}`,
      ...(resolvedHeightHint.value ? { '--fragment-min-height': `${resolvedHeightHint.value}px` } : {}),
      ...(lockedHeight.value ? { height: `${lockedHeight.value}px` } : {})
    } as Record<string, string>

    const placeholderStyle = {
      gridColumn: resolvedColumn,
      gridRow: resolvedRow,
      display: 'none'
    } as Record<string, string>

    return (
      <>
        {resolvedSize && expandable !== false ? (
          <FragmentCardOverflowEffects
            id={id}
            expandable={expandable}
            resolvedSize={resolvedSize}
            cardRef={cardRef}
            isInView={isInView}
            layoutTick={layoutTick}
            expandedId={expandedId}
            autoExpandable={autoExpandable}
          />
        ) : null}
        <div ref={placeholderRef} class="fragment-card-placeholder" style={placeholderStyle} aria-hidden="true" />
        <article
          ref={cardRef}
          class={{ 'fragment-card': true, 'is-expanded': isExpanded, 'is-inline': isInline }}
          style={cardStyle}
          data-pretext-card-root="true"
          data-motion={disableMotion || fragmentId ? undefined : ''}
          data-motion-skip-visible={disableMotion || fragmentId ? undefined : ''}
          data-variant={resolvedVariant === 'card' ? undefined : resolvedVariant}
          data-draggable={isDraggable ? undefined : 'false'}
          data-wave-in={waveIn ? '' : undefined}
          data-critical={critical ? 'true' : undefined}
          data-fragment-id={fragmentId}
          data-fragment-height-hint={resolvedHeightHint.value ? `${resolvedHeightHint.value}` : undefined}
          data-fragment-height-layout={serializeFragmentHeightLayout(props.fragmentHeightLayout ?? null) ?? undefined}
          data-fragment-loaded={props.fragmentLoaded ? 'true' : undefined}
          data-fragment-ready={fragmentReady.value ? 'true' : undefined}
          data-fragment-stage={currentStage.value}
          data-ready-stagger-state={readyStaggerState.value}
          data-reveal-phase={fragmentId ? revealPhase.value : undefined}
          data-reveal-locked={revealLocked.value ? 'true' : 'false'}
          onClick$={canToggleExpand ? handleToggle : undefined}
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
        </article>
      </>
    )
})
