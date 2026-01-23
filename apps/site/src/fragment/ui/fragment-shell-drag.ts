import { useVisibleTask$, type Signal } from '@builder.io/qwik'
import type { FragmentPlan } from '../types'
import type { FragmentDragState } from './fragment-shell-types'
import {
  DRAG_HOLD_MS,
  DRAG_MOVE_THRESHOLD,
  DRAG_REORDER_DURATION_MS,
  DRAG_REORDER_EASE,
  DRAG_SCROLL_EDGE_PX,
  DRAG_SCROLL_MAX_PX,
  DRAG_SWAP_HOVER_MS,
  INTERACTIVE_SELECTOR,
  buildOrderedIds
} from './fragment-shell-utils'

type FragmentShellDragOptions = {
  planValue: FragmentPlan
  orderIds: Signal<string[]>
  dragState: Signal<FragmentDragState>
  layoutTick: Signal<number>
  gridRef: Signal<HTMLDivElement | undefined>
}

export const useFragmentShellDrag = ({
  planValue,
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
      let liveReorder = false
      let swapAdjustFrame = 0
      let reorderFrame = 0
      let reorderTransitionFrame = 0
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
      let swapTimer = 0
      let swapTargetId: string | null = null
      let swapInsertAfter = false
      let finalizePending = false

      const getOrderIds = () => buildOrderedIds(planValue.fragments, orderIds.value)
      const getWrapperFragmentId = (wrapper: HTMLElement) =>
        wrapper.querySelector<HTMLElement>('.fragment-card')?.dataset.fragmentId ?? null
      const isCardDraggable = (card: HTMLElement | null) => card?.dataset.draggable !== 'false'
      const isIdDraggable = (id: string) => {
        const card = grid.querySelector<HTMLElement>(`.fragment-card[data-fragment-id="${id}"]`)
        return isCardDraggable(card)
      }
      const splitOrder = (current: string[]) => {
        const locked = new Map<number, string>()
        const draggable: string[] = []
        current.forEach((entryId, index) => {
          if (isIdDraggable(entryId)) {
            draggable.push(entryId)
          } else {
            locked.set(index, entryId)
          }
        })
        return { draggable, locked }
      }
      const mergeOrder = (draggable: string[], locked: Map<number, string>, total: number) => {
        const merged: string[] = []
        let dragIndex = 0
        for (let index = 0; index < total; index += 1) {
          const lockedId = locked.get(index)
          if (lockedId) {
            merged.push(lockedId)
            continue
          }
          const next = draggable[dragIndex]
          if (next) {
            merged.push(next)
            dragIndex += 1
          }
        }
        return merged
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
        dropIndicator.classList.remove('is-drop-before', 'is-drop-after')
        dropIndicator = null
      }

      const clearSwapTimer = () => {
        if (!swapTimer) return
        window.clearTimeout(swapTimer)
        swapTimer = 0
        swapTargetId = null
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
        finalizePending = false
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
        finalizePending = false
        clearHold()
        clearSwapTimer()
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
        if (dragActivated && draggingId && pendingTargetId) {
          dropTargetId = pendingTargetId
          dropInsertAfter = pendingInsertAfter
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
            applyOrderToDom(resolved.order, { animate: true })
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
        const { draggable, locked } = splitOrder(current)
        if (!draggable.length) return current
        if (!draggable.includes(id) || !draggable.includes(targetId)) return current
        const without = draggable.filter((entryId) => entryId !== id)
        const targetIndex = without.indexOf(targetId)
        if (targetIndex === -1) return current
        const insertIndex = insertAfter ? targetIndex + 1 : targetIndex
        without.splice(insertIndex, 0, id)
        return mergeOrder(without, locked, current.length)
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

      const getInsertAfter = (rect: DOMRect) =>
        lastY > rect.top + rect.height / 2 ||
        (Math.abs(lastY - (rect.top + rect.height / 2)) < 6 && lastX > rect.left + rect.width / 2)

      const applyLiveInsert = (targetId: string, insertAfter: boolean) => {
        if (!draggingEl || !draggingId) return
        const beforeRect = draggingEl.getBoundingClientRect()
        const resolved = resolveOrder(draggingId, targetId, insertAfter)
        if (resolved.order.join('|') === orderIds.value.join('|')) return resolved.insertAfter
        orderIds.value = resolved.order
        applyOrderToDom(resolved.order, { animate: true, draggingId })
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

      const scheduleSwap = () => {
        clearSwapTimer()
        if (!pendingTargetId || !draggingId) return
        swapTargetId = pendingTargetId
        swapInsertAfter = pendingInsertAfter
        swapTimer = window.setTimeout(() => {
          swapTimer = 0
          if (!dragging || !draggingId) return
          if (swapTargetId !== pendingTargetId || swapInsertAfter !== pendingInsertAfter) return
          if (!pendingTargetId) return
          const resolvedInsert = applyLiveInsert(pendingTargetId, pendingInsertAfter)
          if (resolvedInsert !== undefined && resolvedInsert !== pendingInsertAfter && dropIndicator) {
            pendingInsertAfter = resolvedInsert
            dropIndicator.classList.remove('is-drop-before', 'is-drop-after')
            dropIndicator.classList.add(resolvedInsert ? 'is-drop-after' : 'is-drop-before')
          }
        }, DRAG_SWAP_HOVER_MS)
      }

      const updatePosition = () => {
        updateFrame = 0
        if (!dragging || !draggingEl || !draggingId) {
          finalizePending = false
          return
        }
        const dx = lastX - startX
        const dy = lastY - startY
        const closest = pickClosestTarget()
        if (closest) {
          const targetId = closest.el.dataset.fragmentId ?? null
          if (targetId && targetId !== draggingId) {
            const insertAfter = getInsertAfter(closest.rect)
            const targetChanged = pendingTargetId !== targetId
            if (targetChanged || pendingInsertAfter !== insertAfter) {
              pendingTargetId = targetId
              pendingInsertAfter = insertAfter
              clearDropIndicator()
              dropIndicator = closest.el
              dropIndicator.classList.add(insertAfter ? 'is-drop-after' : 'is-drop-before')
              scheduleSwap()
            }
          }
        }

        draggingEl.style.transform = `translate(${dx}px, ${dy}px)`

        if (finalizePending) {
          finalizePending = false
          finishDrag()
        }
      }

      const pickClosestTarget = (): {
        el: HTMLElement
        rect: DOMRect
        distance: number
        threshold: number
      } | null => {
        if (!draggingEl) return null
        const elementAtPoint =
          typeof document !== 'undefined' ? document.elementFromPoint(lastX, lastY) : null
        const directTarget = elementAtPoint?.closest<HTMLElement>('.fragment-card') ?? null
        if (directTarget && directTarget !== draggingEl && isCardDraggable(directTarget)) {
          return { el: directTarget, rect: directTarget.getBoundingClientRect(), distance: 0, threshold: 0 }
        }
        const cards = Array.from(grid.querySelectorAll<HTMLElement>('.fragment-card')).filter(
          (card) => card !== draggingEl && isCardDraggable(card)
        )
        if (!cards.length) return null
        let closestEl: HTMLElement | null = null
        let closestRect: DOMRect | null = null
        let closestDistance = Infinity
        let closestThreshold = 0
        cards.forEach((card) => {
          const rect = card.getBoundingClientRect()
          const cx = rect.left + rect.width / 2
          const cy = rect.top + rect.height / 2
          const dx = lastX - cx
          const dy = lastY - cy
          const distance = dx * dx + dy * dy
          const threshold = Math.max(160, Math.min(rect.width, rect.height) * 0.6)
          if (distance < closestDistance) {
            closestEl = card
            closestRect = rect
            closestDistance = distance
            closestThreshold = threshold
          }
        })
        if (!closestEl || !closestRect) return null
        if (Math.sqrt(closestDistance) > closestThreshold) return null
        return { el: closestEl, rect: closestRect, distance: closestDistance, threshold: closestThreshold }
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
