import { useVisibleTask$, type Signal } from '@builder.io/qwik'
import type { FragmentDragState } from './fragment-shell-types'
import {
  DRAG_HOLD_MS,
  DRAG_MOVE_THRESHOLD,
  DRAG_REORDER_DURATION_MS,
  DRAG_REORDER_EASE,
  DRAG_SCROLL_EDGE_PX,
  DRAG_SCROLL_MAX_PX,
  INTERACTIVE_SELECTOR,
} from './fragment-shell-utils'

type FragmentShellDragOptions = {
  orderIds: Signal<string[]>
  dragState: Signal<FragmentDragState>
  layoutTick: Signal<number>
  gridRef: Signal<HTMLDivElement | undefined>
}

export const useFragmentShellDrag = ({
  orderIds,
  dragState,
  layoutTick,
  gridRef
}: FragmentShellDragOptions) => {
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
      let reorderFrame = 0
      let reorderTransitionFrame = 0
      let pointerId: number | null = null
      let startX = 0
      let startY = 0
      let lastX = 0
      let lastY = 0
      let dragStartRect: DOMRect | null = null
      let draggingId: string | null = null
      let draggingEl: HTMLElement | null = null
      let pendingTargetId: string | null = null
      let dropIndicator: HTMLElement | null = null
      let previousUserSelect = ''
      let finalizePending = false

      type SlotSnapshot = {
        slot: HTMLElement
        card: HTMLElement | null
        id: string | null
        draggable: boolean
        rect: DOMRect
      }

      const getWrapperFragmentId = (wrapper: HTMLElement) =>
        wrapper.querySelector<HTMLElement>('.fragment-card')?.dataset.fragmentId ?? null
      const isCardDraggable = (card: HTMLElement | null) => card?.dataset.draggable !== 'false'

      const getSlotSnapshots = (): SlotSnapshot[] => {
        const slots = Array.from(grid.querySelectorAll<HTMLElement>('.fragment-slot'))
        return slots.map((slot) => {
          const card = slot.querySelector<HTMLElement>('.fragment-card')
          const id = card?.dataset.fragmentId ?? null
          return {
            slot,
            card,
            id,
            draggable: Boolean(card && isCardDraggable(card)),
            rect: slot.getBoundingClientRect()
          }
        })
      }

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
        dropIndicator.classList.remove('is-drop-target', 'is-drop-before', 'is-drop-after')
        dropIndicator = null
      }

      const updateDropIndicator = (slots: SlotSnapshot[], targetId: string | null) => {
        const nextCard = targetId ? slots.find((slot) => slot.id === targetId)?.card ?? null : null
        if (dropIndicator === nextCard) return
        clearDropIndicator()
        if (!nextCard) return
        dropIndicator = nextCard
        dropIndicator.classList.add('is-drop-target')
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
        finalizePending = false
        dragStartRect = draggingEl.getBoundingClientRect()
        dragState.value = { active: true, suppressUntil: 0, draggingId }
        grid.classList.add('is-dragging')
        previousUserSelect = document.body.style.userSelect
        document.body.style.userSelect = 'none'
        draggingEl.classList.add('is-dragging')
        draggingEl.style.pointerEvents = 'none'
        draggingEl.style.willChange = 'transform'
        pendingTargetId = null
        clearDropIndicator()
        scheduleAutoScroll()
      }

      const buildNextOrder = (slots: SlotSnapshot[], targetId: string) => {
        if (!draggingId) return null
        const ids = slots.map((slot) => slot.id)
        if (ids.some((id) => typeof id !== 'string')) return null
        const currentOrder = ids as string[]
        const draggingIndex = currentOrder.indexOf(draggingId)
        const targetIndex = currentOrder.indexOf(targetId)
        if (draggingIndex === -1 || targetIndex === -1) return null
        if (draggingIndex === targetIndex || targetId === draggingId) return currentOrder
        const next = [...currentOrder]
        next[draggingIndex] = targetId
        next[targetIndex] = draggingId
        return next
      }

      const resolvePointerTargetId = () => {
        const elementAtPoint =
          typeof document !== 'undefined' ? document.elementFromPoint(lastX, lastY) : null
        const slotTarget = elementAtPoint?.closest<HTMLElement>('.fragment-slot') ?? null
        if (!slotTarget) return null
        const card = slotTarget.querySelector<HTMLElement>('.fragment-card')
        const id = card?.dataset.fragmentId ?? null
        if (!id || id === draggingId) return null
        if (!isCardDraggable(card)) return null
        return id
      }

      const finishDrag = () => {
        finalizePending = false
        clearHold()
        stopAutoScroll()
        if (updateFrame) {
          cancelAnimationFrame(updateFrame)
          updateFrame = 0
        }
        let dropTargetId: string | null = null
        if (dragActivated && draggingId) {
          dropTargetId = pendingTargetId ?? resolvePointerTargetId()
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
        if (dragActivated && draggingId && dropTargetId) {
          const slots = getSlotSnapshots()
          const nextOrder = buildNextOrder(slots, dropTargetId)
          if (nextOrder && nextOrder.join('|') !== orderIds.value.join('|')) {
            orderIds.value = nextOrder
            applyOrderToDom(nextOrder, { animate: true })
            layoutTick.value += 1
          }
        }
        dragActivated = false
        draggingId = null
        draggingEl = null
        dragStartRect = null
        pointerId = null
        pendingTargetId = null
      }

      const applyOrderToDom = (
        order: string[],
        options: { animate?: boolean; draggingId?: string | null } = {}
      ) => {
        const animate = options.animate ?? false
        const draggingFragmentId = options.draggingId ?? null
        const wrappers = animate ? Array.from(grid.querySelectorAll<HTMLElement>('.fragment-card-wrap')) : []
        const beforeRects = animate
          ? new Map(wrappers.map((wrapper) => [wrapper, wrapper.getBoundingClientRect()]))
          : null
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
        if (!animate || !beforeRects || !wrappers.length) return
        if (reorderFrame) cancelAnimationFrame(reorderFrame)
        if (reorderTransitionFrame) cancelAnimationFrame(reorderTransitionFrame)
        reorderFrame = requestAnimationFrame(() => {
          reorderFrame = 0
          const moved: HTMLElement[] = []
          wrappers.forEach((wrapper) => {
            if (draggingFragmentId && getWrapperFragmentId(wrapper) === draggingFragmentId) return
            const before = beforeRects.get(wrapper)
            if (!before) return
            const after = wrapper.getBoundingClientRect()
            const dx = before.left - after.left
            const dy = before.top - after.top
            if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return
            wrapper.style.transition = 'transform 0s'
            wrapper.style.transform = `translate(${dx}px, ${dy}px)`
            moved.push(wrapper)
          })
          if (!moved.length) return
          reorderTransitionFrame = requestAnimationFrame(() => {
            reorderTransitionFrame = 0
            moved.forEach((wrapper) => {
              wrapper.style.transition = `transform ${DRAG_REORDER_DURATION_MS}ms ${DRAG_REORDER_EASE}`
              wrapper.style.transform = ''
              const cleanup = () => {
                wrapper.style.transition = ''
              }
              wrapper.addEventListener('transitionend', cleanup, { once: true })
            })
          })
        })
      }

      const buildGhostRect = (dx: number, dy: number) => {
        if (!dragStartRect) return null
        return {
          left: dragStartRect.left + dx,
          top: dragStartRect.top + dy,
          right: dragStartRect.right + dx,
          bottom: dragStartRect.bottom + dy,
          width: dragStartRect.width,
          height: dragStartRect.height
        }
      }

      const getRectCenter = (rect: { left: number; top: number; width: number; height: number }) => ({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      })

      const getOverlapArea = (rect: { left: number; top: number; right: number; bottom: number }, other: DOMRect) => {
        const overlapX = Math.max(0, Math.min(rect.right, other.right) - Math.max(rect.left, other.left))
        const overlapY = Math.max(0, Math.min(rect.bottom, other.bottom) - Math.max(rect.top, other.top))
        return overlapX * overlapY
      }

      const pickTargetId = (ghostRect: ReturnType<typeof buildGhostRect>) => {
        const slots = getSlotSnapshots()
        if (!slots.length || !ghostRect) {
          return { targetId: null, slots }
        }
        const gridRect = grid.getBoundingClientRect()
        const margin = 32
        const ghostCenter = getRectCenter(ghostRect)
        if (
          ghostCenter.x < gridRect.left - margin ||
          ghostCenter.x > gridRect.right + margin ||
          ghostCenter.y < gridRect.top - margin ||
          ghostCenter.y > gridRect.bottom + margin
        ) {
          return { targetId: null, slots }
        }

        let bestTargetId: string | null = null
        let bestOverlap = 0
        let bestDistance = Number.POSITIVE_INFINITY

        slots.forEach((slot) => {
          if (!slot.draggable || !slot.id || !slot.card || slot.id === draggingId) return
          const overlap = getOverlapArea(ghostRect, slot.rect)
          if (overlap <= 0) return
          const slotCenter = getRectCenter(slot.rect)
          const dx = ghostCenter.x - slotCenter.x
          const dy = ghostCenter.y - slotCenter.y
          const distance = Math.hypot(dx, dy)
          if (overlap > bestOverlap || (overlap === bestOverlap && distance < bestDistance)) {
            bestOverlap = overlap
            bestDistance = distance
            bestTargetId = slot.id
          }
        })

        if (bestTargetId) {
          return { targetId: bestTargetId, slots }
        }

        const pointerTargetId = resolvePointerTargetId()
        if (pointerTargetId) {
          return { targetId: pointerTargetId, slots }
        }

        let nearestId: string | null = null
        let nearestDistance = Number.POSITIVE_INFINITY
        slots.forEach((slot) => {
          if (!slot.draggable || !slot.id || !slot.card || slot.id === draggingId) return
          const slotCenter = getRectCenter(slot.rect)
          const dx = ghostCenter.x - slotCenter.x
          const dy = ghostCenter.y - slotCenter.y
          const distance = Math.hypot(dx, dy)
          if (distance < nearestDistance) {
            nearestDistance = distance
            nearestId = slot.id
          }
        })

        return { targetId: nearestId, slots }
      }

      const updatePosition = () => {
        updateFrame = 0
        if (!dragging || !draggingEl || !draggingId) {
          finalizePending = false
          return
        }
        const dx = lastX - startX
        const dy = lastY - startY
        if (!finalizePending) {
          const ghostRect = buildGhostRect(dx, dy)
          const { targetId, slots } = pickTargetId(ghostRect)
          if (targetId !== pendingTargetId) {
            pendingTargetId = targetId
            updateDropIndicator(slots, targetId)
          }
        }

        draggingEl.style.transform = `translate(${dx}px, ${dy}px)`

        if (finalizePending) {
          finalizePending = false
          finishDrag()
        }
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
        if (!isCardDraggable(card)) return
        if (card.classList.contains('is-expanded')) return
        const cardId = card.dataset.fragmentId ?? null
        if (!cardId) return

        startX = event.clientX
        startY = event.clientY
        lastX = startX
        lastY = startY
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
            startDrag()
          }
          if (!dragging) return
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
        if (dragging) {
          finalizePending = true
          scheduleUpdate()
          return
        }
        finishDrag()
      }

      const handlePointerCancel = (event: PointerEvent) => {
        if (!pointerId || event.pointerId !== pointerId) return
        lastX = event.clientX
        lastY = event.clientY
        if (draggingEl) {
          draggingEl.releasePointerCapture(pointerId)
        }
        if (dragging) {
          finalizePending = true
          scheduleUpdate()
          return
        }
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
        if (reorderFrame) cancelAnimationFrame(reorderFrame)
        if (reorderTransitionFrame) cancelAnimationFrame(reorderTransitionFrame)
        finishDrag()
      })
    },
    { strategy: 'document-ready' }
  )
}
