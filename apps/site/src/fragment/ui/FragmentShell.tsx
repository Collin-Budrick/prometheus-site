import { $, component$, useComputed$, useOnDocument, useSignal, useTask$, useVisibleTask$ } from '@builder.io/qwik'
import { FragmentCard } from '@prometheus/ui'
import type { FragmentPayloadMap, FragmentPayloadValue, FragmentPlan, FragmentPlanValue } from '../types'
import { applySpeculationRules, buildSpeculationRulesForPlan, useSharedFragmentStatusSignal } from '@core/fragments'
import { useLangCopy, useSharedLangSignal } from '../../shared/lang-bridge'
import type { Lang } from '../../shared/lang-store'
import { getFragmentHeaderCopy } from '../../shared/fragment-copy'
import { FragmentRenderer } from './FragmentRenderer'
import { FragmentStreamController } from './FragmentStreamController'
import { applyHeaderOverride } from './header-overrides'
import { resolveFragments, resolvePlan } from './utils'
import { appConfig } from '../../app-config'

type FragmentShellProps = {
  plan: FragmentPlanValue
  initialFragments: FragmentPayloadValue
  path: string
  initialLang: Lang
}

type FragmentClientEffectsProps = {
  planValue: FragmentPlan
  initialFragmentMap: FragmentPayloadMap
}

const DESKTOP_MIN_WIDTH = 1025
const ORDER_STORAGE_PREFIX = 'fragment:card-order:v1'
const DRAG_HOLD_MS = 240
const DRAG_MOVE_THRESHOLD = 6
const DRAG_SCROLL_EDGE_PX = 90
const DRAG_SCROLL_MAX_PX = 20
const INTERACTIVE_SELECTOR =
  'a, button, input, textarea, select, option, [role="button"], [contenteditable="true"], [data-fragment-link]'

type FragmentPlanEntry = FragmentPlan['fragments'][number]
type BentoSlot = {
  id: string
  size: 'small' | 'big' | 'tall'
  column: string
  row: string
}

type FragmentDragState = {
  active: boolean
  suppressUntil: number
  draggingId: string | null
}

const parseStoredOrder = (raw: string | null) => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string') ? parsed : []
  } catch {
    return []
  }
}

const buildOrderedIds = (entries: FragmentPlanEntry[], stored: string[]) => {
  const ids = entries.map((entry) => entry.id)
  const idSet = new Set(ids)
  const ordered: string[] = []
  const seen = new Set<string>()
  stored.forEach((id) => {
    if (!idSet.has(id) || seen.has(id)) return
    seen.add(id)
    ordered.push(id)
  })
  ids.forEach((id) => {
    if (seen.has(id)) return
    seen.add(id)
    ordered.push(id)
  })
  return ordered
}

const buildOrderedEntries = (entries: FragmentPlanEntry[], orderIds: string[]) => {
  if (!orderIds.length) return entries
  const entryMap = new Map(entries.map((entry) => [entry.id, entry]))
  const ordered: FragmentPlanEntry[] = []
  orderIds.forEach((id) => {
    const entry = entryMap.get(id)
    if (!entry) return
    ordered.push(entry)
    entryMap.delete(id)
  })
  entryMap.forEach((entry) => ordered.push(entry))
  return ordered
}

const BENTO_SLOTS_PER_CYCLE = 6
const BENTO_ROWS_PER_CYCLE = 4

const buildBentoSlots = (count: number) => {
  const slots: BentoSlot[] = []
  let cycle = 0
  while (slots.length < count) {
    const rowStart = cycle * BENTO_ROWS_PER_CYCLE + 1
    const tallLeft = cycle % 2 === 0
    const leftCol = tallLeft ? '1 / span 6' : '7 / span 6'
    const rightCol = tallLeft ? '7 / span 6' : '1 / span 6'
    const baseId = cycle * BENTO_SLOTS_PER_CYCLE
    slots.push(
      { id: `slot-${baseId + 1}`, size: 'small', column: leftCol, row: `${rowStart}` },
      { id: `slot-${baseId + 2}`, size: 'small', column: rightCol, row: `${rowStart}` },
      { id: `slot-${baseId + 3}`, size: 'big', column: '1 / -1', row: `${rowStart + 1}` },
      { id: `slot-${baseId + 4}`, size: 'tall', column: leftCol, row: `${rowStart + 2} / span 2` },
      { id: `slot-${baseId + 5}`, size: 'small', column: rightCol, row: `${rowStart + 2}` },
      { id: `slot-${baseId + 6}`, size: 'small', column: rightCol, row: `${rowStart + 3}` }
    )
    cycle += 1
  }
  return slots.slice(0, count)
}

const FragmentClientEffects = component$(({ planValue, initialFragmentMap }: FragmentClientEffectsProps) => {
  useVisibleTask$(
    (ctx) => {
      if (!appConfig.enablePrefetch) return

      const teardownSpeculation = applySpeculationRules(
        buildSpeculationRulesForPlan(planValue, appConfig.apiBase, {
          knownFragments: initialFragmentMap,
          currentPath: typeof window !== 'undefined' ? window.location.pathname : undefined
        })
      )

      ctx.cleanup(() => teardownSpeculation())
    },
    { strategy: 'document-idle' }
  )

  return null
})

export const FragmentShell = component$(({ plan, initialFragments, path, initialLang }: FragmentShellProps) => {
  const langSignal = useSharedLangSignal()
  useTask$((ctx) => {
    ctx.track(() => initialLang)
    if (langSignal.value !== initialLang) {
      langSignal.value = initialLang
    }
  })
  const copy = useLangCopy(langSignal)
  const planValue = resolvePlan(plan)
  const initialFragmentMap = resolveFragments(initialFragments)
  const fragments = useSignal<FragmentPayloadMap>(initialFragmentMap)
  const status = useSharedFragmentStatusSignal()
  const expandedId = useSignal<string | null>(null)
  const layoutTick = useSignal(0)
  const stackScheduler = useSignal<(() => void) | null>(null)
  const gridRef = useSignal<HTMLDivElement>()
  const fragmentHeaders = useComputed$(() => getFragmentHeaderCopy(langSignal.value))
  const orderIds = useSignal<string[]>([])
  const dragState = useSignal<FragmentDragState>({
    active: false,
    suppressUntil: 0,
    draggingId: null
  })
  const orderedEntries = useComputed$(() => buildOrderedEntries(planValue.fragments, orderIds.value))
  const slottedEntries = useComputed$(() => {
    const entries = orderedEntries.value
    const slots = buildBentoSlots(entries.length)
    return slots.map((slot, index) => ({ entry: entries[index], slot }))
  })
  const initialReady =
    typeof window !== 'undefined' &&
    (window as typeof window & { __PROM_CLIENT_READY?: boolean }).__PROM_CLIENT_READY === true
  const clientReady = useSignal(initialReady)

  useOnDocument(
    'client-ready',
    $(() => {
      clientReady.value = true
    })
  )

  useOnDocument(
    'keydown',
    $((event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        expandedId.value = null
      }
    })
  )

  useVisibleTask$(
    () => {
      if (typeof window === 'undefined') return
      const storageKey = `${ORDER_STORAGE_PREFIX}:${path}`
      const stored = parseStoredOrder(window.localStorage.getItem(storageKey))
      const nextOrder = buildOrderedIds(planValue.fragments, stored)
      orderIds.value = nextOrder
      if (stored.length === 0 || stored.join('|') !== nextOrder.join('|')) {
        window.localStorage.setItem(storageKey, JSON.stringify(nextOrder))
      }
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$(
    (ctx) => {
      ctx.track(() => orderIds.value)
      ctx.track(() => dragState.value.active)
      if (typeof window === 'undefined') return
      if (!orderIds.value.length) return
      if (dragState.value.active) return
      const storageKey = `${ORDER_STORAGE_PREFIX}:${path}`
      window.localStorage.setItem(storageKey, JSON.stringify(orderIds.value))
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$((ctx) => {
    ctx.track(() => expandedId.value)
    if (typeof document === 'undefined') return
    if (expandedId.value) {
      document.body.classList.add('card-expanded')
    } else {
      document.body.classList.remove('card-expanded')
    }
  })

  useVisibleTask$(
    (ctx) => {
      if (typeof window === 'undefined') return
      const grid = gridRef.value
      if (!grid) return

      let holdTimer = 0
      let updateFrame = 0
      let scrollFrame = 0
      let dragging = false
      let dragActivated = false
      let liveReorder = false
      let swapAdjustFrame = 0
      let pointerId: number | null = null
      let startX = 0
      let startY = 0
      let lastX = 0
      let lastY = 0
      let draggingId: string | null = null
      let draggingEl: HTMLElement | null = null
      let pendingTargetId: string | null = null
      let pendingInsertAfter = false
      let dropIndicator: HTMLElement | null = null
      let previousUserSelect = ''

      const getOrderIds = () => buildOrderedIds(planValue.fragments, orderIds.value)

      const clearHold = () => {
        if (!holdTimer) return
        window.clearTimeout(holdTimer)
        holdTimer = 0
      }

      const resetDraggingStyles = () => {
        if (!draggingEl) return
        draggingEl.classList.remove('is-dragging')
        draggingEl.style.transform = ''
        draggingEl.style.zIndex = ''
        draggingEl.style.pointerEvents = ''
        draggingEl.style.willChange = ''
      }

      const clearDropIndicator = () => {
        if (!dropIndicator) return
        dropIndicator.classList.remove('is-drop-before', 'is-drop-after')
        dropIndicator = null
      }

      const stopAutoScroll = () => {
        if (!scrollFrame) return
        cancelAnimationFrame(scrollFrame)
        scrollFrame = 0
      }

      const autoScroll = () => {
        scrollFrame = 0
        if (!dragging) return
        const viewportHeight = window.innerHeight
        const edge = DRAG_SCROLL_EDGE_PX
        let velocity = 0
        if (lastY < edge) {
          const intensity = Math.min(1, (edge - lastY) / edge)
          velocity = -Math.max(1, DRAG_SCROLL_MAX_PX * intensity)
        } else if (lastY > viewportHeight - edge) {
          const intensity = Math.min(1, (lastY - (viewportHeight - edge)) / edge)
          velocity = Math.max(1, DRAG_SCROLL_MAX_PX * intensity)
        }
        if (velocity !== 0) {
          const before = window.scrollY
          window.scrollBy(0, velocity)
          const after = window.scrollY
          startY += after - before
          scheduleUpdate()
          scrollFrame = requestAnimationFrame(autoScroll)
        }
      }

      const scheduleAutoScroll = () => {
        if (scrollFrame || !dragging) return
        scrollFrame = requestAnimationFrame(autoScroll)
      }

      const startDrag = () => {
        if (!draggingEl || !draggingId || dragging) return
        dragging = true
        dragActivated = true
        liveReorder = false
        dragState.value = { active: true, suppressUntil: 0, draggingId }
        grid.classList.add('is-dragging')
        previousUserSelect = document.body.style.userSelect
        document.body.style.userSelect = 'none'
        draggingEl.classList.add('is-dragging')
        draggingEl.style.pointerEvents = 'none'
        draggingEl.style.willChange = 'transform'
        pendingTargetId = null
        pendingInsertAfter = false
        clearDropIndicator()
        scheduleAutoScroll()
      }

      const finishDrag = () => {
        clearHold()
        stopAutoScroll()
        if (updateFrame) {
          cancelAnimationFrame(updateFrame)
          updateFrame = 0
        }
        if (swapAdjustFrame) {
          cancelAnimationFrame(swapAdjustFrame)
          swapAdjustFrame = 0
        }
        let dropTargetId: string | null = null
        let dropInsertAfter = false
        if (dragActivated && draggingId) {
          dropTargetId = pendingTargetId
          if (!dropTargetId) {
            const elementAtPoint =
              typeof document !== 'undefined' ? document.elementFromPoint(lastX, lastY) : null
            const cardAtPoint = elementAtPoint?.closest<HTMLElement>('.fragment-card') ?? null
            const cardId = cardAtPoint?.dataset.fragmentId ?? null
            dropTargetId = cardId && cardId !== draggingId ? cardId : null
            if (dropTargetId && cardAtPoint) {
              const rect = cardAtPoint.getBoundingClientRect()
              dropInsertAfter = getInsertAfter(rect)
            }
          }
          if (!dropTargetId) {
            const closest = pickClosestTarget()
            dropTargetId = closest?.el.dataset.fragmentId ?? null
            if (closest) {
              dropInsertAfter = getInsertAfter(closest.rect)
            }
          } else {
            dropInsertAfter = pendingInsertAfter
          }
        }
        if (dragging) {
          resetDraggingStyles()
        }
        clearDropIndicator()
        dragging = false
        grid.classList.remove('is-dragging')
        document.body.style.userSelect = previousUserSelect
        dragState.value = {
          active: false,
          suppressUntil: dragActivated ? Date.now() + 300 : 0,
          draggingId: null
        }
        if (!liveReorder && dragActivated && draggingId && dropTargetId && dropTargetId !== draggingId) {
          const resolved = resolveOrder(draggingId, dropTargetId, dropInsertAfter)
          if (resolved.order.join('|') !== orderIds.value.join('|')) {
            orderIds.value = resolved.order
            applyOrderToDom(resolved.order)
            layoutTick.value += 1
          }
        }
        dragActivated = false
        draggingId = null
        draggingEl = null
        pointerId = null
        pendingTargetId = null
        pendingInsertAfter = false
        liveReorder = false
      }

      const moveOrder = (current: string[], id: string, targetId: string, insertAfter: boolean) => {
        if (!current.length) return current
        const without = current.filter((entryId) => entryId !== id)
        const targetIndex = without.indexOf(targetId)
        if (targetIndex === -1) return current
        const insertIndex = insertAfter ? targetIndex + 1 : targetIndex
        without.splice(insertIndex, 0, id)
        return without
      }

      const resolveOrder = (id: string, targetId: string, insertAfter: boolean) => {
        const current = getOrderIds()
        const preferred = moveOrder(current, id, targetId, insertAfter)
        if (preferred.join('|') !== current.join('|')) {
          return { order: preferred, insertAfter }
        }
        const flipped = moveOrder(current, id, targetId, !insertAfter)
        if (flipped.join('|') !== current.join('|')) {
          return { order: flipped, insertAfter: !insertAfter }
        }
        return { order: current, insertAfter }
      }

      const applyOrderToDom = (order: string[]) => {
        const slotEls = Array.from(grid.querySelectorAll<HTMLElement>('.fragment-slot'))
        order.forEach((id, index) => {
          const slotEl = slotEls[index]
          if (!slotEl) return
          const card = grid.querySelector<HTMLElement>(`.fragment-card[data-fragment-id="${id}"]`)
          if (!card) return
          const wrapper = card.closest<HTMLElement>('.fragment-card-wrap')
          if (!wrapper) return
          if (wrapper.parentElement !== slotEl) {
            slotEl.appendChild(wrapper)
          }
          const slotSize = slotEl.dataset.size
          if (slotSize) {
            card.dataset.size = slotSize
          }
        })
      }

      const getInsertAfter = (rect: DOMRect) =>
        lastY > rect.top + rect.height / 2 ||
        (Math.abs(lastY - (rect.top + rect.height / 2)) < 6 && lastX > rect.left + rect.width / 2)

      const applyLiveInsert = (targetId: string, insertAfter: boolean) => {
        if (!draggingEl || !draggingId) return
        const beforeRect = draggingEl.getBoundingClientRect()
        const resolved = resolveOrder(draggingId, targetId, insertAfter)
        if (resolved.order.join('|') === orderIds.value.join('|')) return resolved.insertAfter
        orderIds.value = resolved.order
        applyOrderToDom(resolved.order)
        layoutTick.value += 1
        liveReorder = true
        if (swapAdjustFrame) cancelAnimationFrame(swapAdjustFrame)
        swapAdjustFrame = requestAnimationFrame(() => {
          swapAdjustFrame = 0
          if (!draggingEl) return
          const afterRect = draggingEl.getBoundingClientRect()
          startX += afterRect.left - beforeRect.left
          startY += afterRect.top - beforeRect.top
        })
        return resolved.insertAfter
      }

      const updatePosition = () => {
        updateFrame = 0
        if (!dragging || !draggingEl || !draggingId) return
        const dx = lastX - startX
        const dy = lastY - startY
        draggingEl.style.transform = `translate(${dx}px, ${dy}px)`

        const closest = pickClosestTarget()
        if (!closest) return
        const targetId = closest.el.dataset.fragmentId ?? null
        if (!targetId || targetId === draggingId) return
        const insertAfter = getInsertAfter(closest.rect)
        const targetChanged = pendingTargetId !== targetId
        if (targetChanged || pendingInsertAfter !== insertAfter) {
          pendingTargetId = targetId
          pendingInsertAfter = insertAfter
          clearDropIndicator()
          dropIndicator = closest.el
          dropIndicator.classList.add(insertAfter ? 'is-drop-after' : 'is-drop-before')
          if (targetChanged) {
            const resolvedInsert = applyLiveInsert(targetId, insertAfter)
            if (resolvedInsert !== undefined && resolvedInsert !== insertAfter) {
              pendingInsertAfter = resolvedInsert
              dropIndicator.classList.remove('is-drop-before', 'is-drop-after')
              dropIndicator.classList.add(resolvedInsert ? 'is-drop-after' : 'is-drop-before')
            }
          } else if (draggingId) {
            const resolvedInsert = applyLiveInsert(targetId, insertAfter)
            if (resolvedInsert !== undefined && resolvedInsert !== insertAfter) {
              pendingInsertAfter = resolvedInsert
              dropIndicator.classList.remove('is-drop-before', 'is-drop-after')
              dropIndicator.classList.add(resolvedInsert ? 'is-drop-after' : 'is-drop-before')
            }
          }
        }
      }

      const pickClosestTarget = () => {
        if (!draggingEl) return null
        const cards = Array.from(grid.querySelectorAll<HTMLElement>('.fragment-card')).filter(
          (card) => card !== draggingEl
        )
        if (!cards.length) return
        let closest: { el: HTMLElement; rect: DOMRect; distance: number } | null = null
        cards.forEach((card) => {
          const rect = card.getBoundingClientRect()
          const cx = rect.left + rect.width / 2
          const cy = rect.top + rect.height / 2
          const dx = lastX - cx
          const dy = lastY - cy
          const distance = dx * dx + dy * dy
          if (!closest || distance < closest.distance) {
            closest = { el: card, rect, distance }
          }
        })
        return closest
      }

      const scheduleUpdate = () => {
        if (updateFrame) return
        updateFrame = requestAnimationFrame(updatePosition)
      }

      const handlePointerDown = (event: PointerEvent) => {
        if (event.button !== 0) return
        if (!event.isPrimary) return
        const target = event.target instanceof HTMLElement ? event.target : null
        if (!target) return
        if (target.closest(INTERACTIVE_SELECTOR)) return
        const card = target.closest<HTMLElement>('.fragment-card')
        if (!card || !grid.contains(card)) return
        if (card.classList.contains('is-expanded')) return
        const cardId = card.dataset.fragmentId ?? null
        if (!cardId) return

        startX = event.clientX
        startY = event.clientY
        lastX = startX
        lastY = startY
        const rect = card.getBoundingClientRect()
        draggingId = cardId
        draggingEl = card
        dragActivated = false
        pointerId = event.pointerId
        holdTimer = window.setTimeout(startDrag, DRAG_HOLD_MS)
        card.setPointerCapture(pointerId)
      }

      const handlePointerMove = (event: PointerEvent) => {
        if (!pointerId || event.pointerId !== pointerId) return
        lastX = event.clientX
        lastY = event.clientY
        if (!dragging) {
          const dx = lastX - startX
          const dy = lastY - startY
          if (Math.hypot(dx, dy) > DRAG_MOVE_THRESHOLD) {
            clearHold()
          }
          return
        }
        event.preventDefault()
        scheduleUpdate()
        scheduleAutoScroll()
      }

      const handlePointerUp = (event: PointerEvent) => {
        if (!pointerId || event.pointerId !== pointerId) return
        lastX = event.clientX
        lastY = event.clientY
        if (draggingEl) {
          draggingEl.releasePointerCapture(pointerId)
        }
        finishDrag()
      }

      const handlePointerCancel = (event: PointerEvent) => {
        if (!pointerId || event.pointerId !== pointerId) return
        finishDrag()
      }

      grid.addEventListener('pointerdown', handlePointerDown)
      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)
      window.addEventListener('pointercancel', handlePointerCancel)

      ctx.cleanup(() => {
        grid.removeEventListener('pointerdown', handlePointerDown)
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', handlePointerUp)
        window.removeEventListener('pointercancel', handlePointerCancel)
        finishDrag()
      })
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$(
    (ctx) => {
      if (typeof window === 'undefined') return
      const grid = gridRef.value
      if (!grid || !('ResizeObserver' in window) || planValue.fragments.length < 2) return
      let frame = 0
      let pending = false
      let lastWidth = 0
      let lastHeight = 0
      let ready = false
      let observer: ResizeObserver | null = null

      const resetState = () => {
        pending = false
        ready = false
        lastWidth = 0
        lastHeight = 0
      }

      const teardownObserver = () => {
        observer?.disconnect()
        observer = null
        if (frame) {
          cancelAnimationFrame(frame)
          frame = 0
        }
      }

      const setupObserver = () => {
        if (observer || window.innerWidth < DESKTOP_MIN_WIDTH) return
        resetState()
        const instance = new ResizeObserver((entries) => {
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
        observer = instance
        instance.observe(grid)
      }

      const handleResize = () => {
        if (window.innerWidth < DESKTOP_MIN_WIDTH) {
          teardownObserver()
          return
        }
        if (!observer) {
          setupObserver()
        }
      }

      setupObserver()
      window.addEventListener('resize', handleResize)

      ctx.cleanup(() => {
        window.removeEventListener('resize', handleResize)
        teardownObserver()
      })
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$(
    (ctx) => {
      ctx.cleanup(() => {
        status.value = 'idle'
      })
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$(
    (ctx) => {
      if (typeof window === 'undefined') return
      const grid = gridRef.value
      if (!grid || typeof ResizeObserver === 'undefined' || planValue.fragments.length < 2) return

      let cardHeights = new WeakMap<HTMLElement, number>()
      let observedCards = new WeakSet<HTMLElement>()
      let frame = 0
      let enabled = false

      const parseSpan = (value: string) => {
        const normalized = value.trim().replace(/\s+/g, ' ')
        if (!normalized.startsWith('span ')) return null
        const parsed = Number.parseInt(normalized.slice(5), 10)
        return Number.isFinite(parsed) ? parsed : null
      }

      const hasInlineCards = () =>
        planValue.fragments.some((entry) => {
          if (entry.fullWidth === true) return false
          if (typeof entry.layout.inlineSpan === 'number') return entry.layout.inlineSpan < 12
          if (entry.layout.size === undefined || entry.layout.size === 'small' || entry.layout.size === 'tall')
            return true
          if (entry.layout.size === 'big') return false
          const span = parseSpan(entry.layout.column)
          return span !== null ? span < 12 : false
        })

      const meetsLayoutConditions = () =>
        window.innerWidth >= DESKTOP_MIN_WIDTH && planValue.fragments.length > 1 && !hasInlineCards()

      const schedule = () => {
        if (frame || !enabled) return
        frame = requestAnimationFrame(() => {
          frame = 0
          if (!meetsLayoutConditions()) {
            grid.classList.remove('is-stacked')
            return
          }

          const cards = Array.from(grid.querySelectorAll<HTMLElement>('.fragment-card')).filter(
            (element) => !element.classList.contains('is-expanded')
          )
          if (!cards.length) return
          const heights = cards.map((card) => cardHeights.get(card) ?? 0).filter((height) => height > 0)
          if (!heights.length) return

          const maxHeight = Math.max(...heights)
          const baseThreshold = Math.max(520, window.innerHeight * 0.65)
          const isStacked = grid.classList.contains('is-stacked')
          const threshold = isStacked ? baseThreshold * 0.85 : baseThreshold
          const shouldStack = maxHeight >= threshold

          if (shouldStack) {
            grid.classList.add('is-stacked')
          } else {
            grid.classList.remove('is-stacked')
          }
        })
      }

      const cardObserver = new ResizeObserver((entries) => {
        let changed = false
        entries.forEach((entry) => {
          if (!(entry.target instanceof HTMLElement)) return
          const height = entry.contentRect.height
          if (height <= 0) return
          const previous = cardHeights.get(entry.target)
          if (previous === undefined || Math.abs(previous - height) > 0.5) {
            cardHeights.set(entry.target, height)
            changed = true
          }
        })
        if (changed) schedule()
      })

      const collectCards = (root: ParentNode) =>
        root instanceof HTMLElement && root.matches('.fragment-card')
          ? [root, ...Array.from(root.querySelectorAll<HTMLElement>('.fragment-card'))]
          : Array.from(root.querySelectorAll<HTMLElement>('.fragment-card'))

      const observeCards = (root: ParentNode) => {
        collectCards(root).forEach((card) => {
          if (observedCards.has(card)) return
          observedCards.add(card)
          cardObserver.observe(card)
        })
      }

      const unobserveCards = (root: ParentNode) => {
        collectCards(root).forEach((card) => {
          cardObserver.unobserve(card)
          observedCards.delete(card)
        })
      }

      const mutationObserver = new MutationObserver((records) => {
        if (!enabled) return
        records.forEach((record) => {
          record.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement) observeCards(node)
          })
          record.removedNodes.forEach((node) => {
            if (node instanceof HTMLElement) unobserveCards(node)
          })
        })
        schedule()
      })

      const stop = () => {
        if (!enabled) return
        enabled = false
        stackScheduler.value = null
        mutationObserver.disconnect()
        cardObserver.disconnect()
        observedCards = new WeakSet<HTMLElement>()
        cardHeights = new WeakMap<HTMLElement, number>()
        grid.classList.remove('is-stacked')
        if (frame) {
          cancelAnimationFrame(frame)
          frame = 0
        }
      }

      const start = () => {
        if (enabled || !meetsLayoutConditions()) return
        enabled = true
        stackScheduler.value = schedule
        observeCards(grid)
        schedule()
        mutationObserver.observe(grid, { childList: true, subtree: true })
      }

      const handleResize = () => {
        if (!meetsLayoutConditions()) {
          stop()
          return
        }
        if (!enabled) {
          start()
          return
        }
        schedule()
      }

      start()
      window.addEventListener('resize', handleResize)

      ctx.cleanup(() => {
        stop()
        window.removeEventListener('resize', handleResize)
      })
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$(
    (ctx) => {
      ctx.track(() => expandedId.value)
      stackScheduler.value?.()
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$(
    (ctx) => {
      ctx.track(() => layoutTick.value)
      ctx.track(() => expandedId.value)
      if (typeof window === 'undefined') return
      const grid = gridRef.value
      if (!grid || typeof ResizeObserver !== 'undefined' || planValue.fragments.length < 2) return

      const parseSpan = (value: string) => {
        const normalized = value.trim().replace(/\s+/g, ' ')
        if (!normalized.startsWith('span ')) return null
        const parsed = Number.parseInt(normalized.slice(5), 10)
        return Number.isFinite(parsed) ? parsed : null
      }

      const hasInlineCards = () =>
        planValue.fragments.some((entry) => {
          if (entry.fullWidth === true) return false
          if (typeof entry.layout.inlineSpan === 'number') return entry.layout.inlineSpan < 12
          if (entry.layout.size === undefined || entry.layout.size === 'small' || entry.layout.size === 'tall')
            return true
          if (entry.layout.size === 'big') return false
          const span = parseSpan(entry.layout.column)
          return span !== null ? span < 12 : false
        })

      let frame = requestAnimationFrame(() => {
        frame = 0
        if (window.innerWidth < DESKTOP_MIN_WIDTH || hasInlineCards()) {
          grid.classList.remove('is-stacked')
          return
        }

        const cards = Array.from(grid.querySelectorAll<HTMLElement>('.fragment-card')).filter(
          (element) => !element.classList.contains('is-expanded')
        )
        if (!cards.length) return
        const heights = cards.map((card) => card.getBoundingClientRect().height).filter((height) => height > 0)
        if (!heights.length) return

        const maxHeight = Math.max(...heights)
        const baseThreshold = Math.max(520, window.innerHeight * 0.65)
        const isStacked = grid.classList.contains('is-stacked')
        const threshold = isStacked ? baseThreshold * 0.85 : baseThreshold
        const shouldStack = maxHeight >= threshold

        if (shouldStack) {
          grid.classList.add('is-stacked')
        } else {
          grid.classList.remove('is-stacked')
        }
      })

      ctx.cleanup(() => {
        if (frame) cancelAnimationFrame(frame)
      })
    },
    { strategy: 'document-ready' }
  )

  return (
    <section class="fragment-shell">
      <div ref={gridRef} class="fragment-grid">
        {slottedEntries.value.map(({ entry, slot }, index) => {
          const fragment = entry ? fragments.value[entry.id] : null
          const headerCopy = entry ? fragmentHeaders.value[entry.id] : null
          const renderNode =
            fragment && headerCopy ? applyHeaderOverride(fragment.tree, headerCopy) : fragment?.tree
          return (
            <div
              key={slot.id}
              class={{
                'fragment-slot': true,
                'is-inline': !slot.column.includes('/ -1') && !slot.column.includes('/-1')
              }}
              data-size={slot.size}
              style={{ gridColumn: slot.column, gridRow: slot.row }}
            >
              {entry ? (
                <div class="fragment-card-wrap">
                  <FragmentCard
                    key={entry.id}
                    id={entry.id}
                    fragmentId={entry.id}
                    column="1 / -1"
                    motionDelay={index * 120}
                    expandedId={expandedId}
                    layoutTick={layoutTick}
                    closeLabel={copy.value.fragmentClose}
                    expandable={entry.expandable}
                    fullWidth={entry.fullWidth}
                    size={slot.size}
                    dragState={dragState}
                  >
                    {fragment ? (
                      <FragmentRenderer node={renderNode ?? fragment.tree} />
                    ) : (
                      <div class="fragment-placeholder is-loading" role="status" aria-live="polite">
                        <div class="loader" aria-hidden="true" />
                        <span class="sr-only">
                          {copy.value.fragmentLoading.replace('{id}', entry.id)}
                        </span>
                      </div>
                    )}
                  </FragmentCard>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
      <FragmentStreamController
        plan={plan}
        initialFragments={initialFragments}
        path={path}
        fragments={fragments}
        status={status}
      />
      {clientReady.value ? (
        <FragmentClientEffects planValue={planValue} initialFragmentMap={initialFragmentMap} />
      ) : null}
    </section>
  )
})
