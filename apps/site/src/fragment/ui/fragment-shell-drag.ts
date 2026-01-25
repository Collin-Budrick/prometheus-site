import { useVisibleTask$, type Signal } from '@builder.io/qwik'
import { GridStack } from 'gridstack'
import type { FragmentDragState } from './fragment-shell-types'
import {
  GRIDSTACK_CELL_HEIGHT,
  GRIDSTACK_COLUMNS,
  GRIDSTACK_MARGIN,
  DESKTOP_MIN_WIDTH,
  INTERACTIVE_SELECTOR
} from './fragment-shell-utils'

type FragmentShellDragOptions = {
  orderIds: Signal<string[]>
  dragState: Signal<FragmentDragState>
  layoutTick: Signal<number>
  gridRef: Signal<HTMLDivElement | undefined>
}

type GridStackElement = HTMLDivElement & { gridstack?: GridStack }

const toGridRows = (heightPx: number) =>
  Math.max(1, Math.ceil((heightPx + GRIDSTACK_MARGIN * 2) / GRIDSTACK_CELL_HEIGHT))

const heightCache = new WeakMap<HTMLElement, number>()

const syncGridFromDom = (gridEl: GridStackElement) => {
  const grid = gridEl.gridstack
  if (!grid) return
  const items = Array.from(gridEl.querySelectorAll<HTMLElement>('.grid-stack-item'))
  const toNumber = (value: string | null, fallback: number) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  const isMobile = typeof window !== 'undefined' && window.innerWidth < DESKTOP_MIN_WIDTH
  const half = Math.max(1, Math.floor(GRIDSTACK_COLUMNS / 2))
  grid.batchUpdate()
  items.forEach((item) => {
    const lock = item.dataset.columnLock
    const lockedX = lock === 'right' ? half : 0
    const x = isMobile ? 0 : lock ? lockedX : toNumber(item.getAttribute('gs-x'), 0)
    const y = toNumber(item.getAttribute('gs-y'), 0)
    const w = isMobile ? 1 : lock ? half : toNumber(item.getAttribute('gs-w'), 1)
    const h = toNumber(item.getAttribute('gs-h'), 1)
    const minW = isMobile ? 1 : lock ? half : undefined
    const maxW = isMobile ? 1 : lock ? half : undefined
    grid.update(item, { x, y, w, h, minW, maxW })
  })
  grid.batchUpdate(false)
}

const syncGridHeights = (gridEl: GridStackElement) => {
  const grid = gridEl.gridstack
  if (!grid) return false
  const items = Array.from(gridEl.querySelectorAll<HTMLElement>('.grid-stack-item'))
  let measured = false
  grid.batchUpdate()
  items.forEach((item) => {
    const card = item.querySelector<HTMLElement>('.fragment-card') ?? item
    const height = card.getBoundingClientRect().height
    if (!Number.isFinite(height) || height <= 0) return
    measured = true
    const rows = toGridRows(height)
    if (heightCache.get(item) === rows) return
    heightCache.set(item, rows)
    grid.update(item, { h: rows })
  })
  grid.batchUpdate(false)
  return measured
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
      ctx.track(() => gridRef.value)
      const gridEl = gridRef.value
      if (!gridEl) return

      const getColumnCount = () => (window.innerWidth < DESKTOP_MIN_WIDTH ? 1 : GRIDSTACK_COLUMNS)
      const initialColumn = getColumnCount()
      let currentColumn = initialColumn

      const grid = GridStack.init(
        {
          column: initialColumn,
          cellHeight: GRIDSTACK_CELL_HEIGHT,
          margin: GRIDSTACK_MARGIN,
          disableResize: true,
          float: false,
          draggable: {
            handle: '.fragment-card',
            cancel: INTERACTIVE_SELECTOR,
            scroll: true,
            appendTo: 'body'
          }
        },
        gridEl
      )

      let ready = false
      let heightFrame = 0
      const observedCards = new Set<HTMLElement>()
      let resizeFrame = 0
      let dragMoveFrame = 0
      let dragStartId: string | null = null
      let dragTargetId: string | null = null
      let pendingPoint: { x: number; y: number } | null = null

      const hasGridVars = () => {
        const style = window.getComputedStyle(gridEl)
        const columnWidth = Number.parseFloat(style.getPropertyValue('--gs-column-width'))
        const cellHeight = Number.parseFloat(style.getPropertyValue('--gs-cell-height'))
        return Number.isFinite(columnWidth) && columnWidth > 0 && Number.isFinite(cellHeight) && cellHeight > 0
      }

      const maybeSetReady = (measured: boolean) => {
        if (ready || !measured || !hasGridVars()) return
        ready = true
        gridEl.dataset.dragReady = 'true'
      }

      syncGridFromDom(gridEl)
      maybeSetReady(syncGridHeights(gridEl))

      const scheduleHeightSync = () => {
        if (heightFrame) return
        heightFrame = requestAnimationFrame(() => {
          heightFrame = 0
          if (dragState.value.active) return
          const measured = syncGridHeights(gridEl)
          maybeSetReady(measured)
        })
      }

      const resizeObserver =
        typeof ResizeObserver !== 'undefined'
          ? new ResizeObserver(() => {
              scheduleHeightSync()
            })
          : null

      const observeCard = (card: HTMLElement) => {
        if (observedCards.has(card)) return
        observedCards.add(card)
        resizeObserver?.observe(card)
      }

      const scanCards = () => {
        gridEl.querySelectorAll<HTMLElement>('.fragment-card').forEach(observeCard)
        scheduleHeightSync()
      }

      const mutationObserver =
        typeof MutationObserver !== 'undefined'
          ? new MutationObserver(() => {
              scanCards()
            })
          : null

      scanCards()
      mutationObserver?.observe(gridEl, { childList: true, subtree: true })

      const applyColumnMode = () => {
        const nextColumn = getColumnCount()
        if (nextColumn === currentColumn) return
        currentColumn = nextColumn
        grid.column(nextColumn, 'move')
        syncGridFromDom(gridEl)
        syncGridHeights(gridEl)
      }

      const scheduleResize = () => {
        if (resizeFrame) return
        resizeFrame = requestAnimationFrame(() => {
          resizeFrame = 0
          if (dragState.value.active) return
          applyColumnMode()
        })
      }

      applyColumnMode()
      window.addEventListener('resize', scheduleResize)

      const getEventPoint = (event: Event) => {
        const source = (event as { originalEvent?: Event }).originalEvent ?? event
        if ('clientX' in source && 'clientY' in source) {
          const { clientX, clientY } = source as MouseEvent
          return { x: clientX, y: clientY }
        }
        if ('touches' in source || 'changedTouches' in source) {
          const touchEvent = source as TouchEvent
          const touch = touchEvent.touches[0] ?? touchEvent.changedTouches[0]
          if (!touch) return null
          return { x: touch.clientX, y: touch.clientY }
        }
        return null
      }

      const resolveTargetId = (point: { x: number; y: number }) => {
        const element = document.elementFromPoint(point.x, point.y)
        if (!element) return null
        const item = element.closest<HTMLElement>('.grid-stack-item')
        if (!item || item.classList.contains('grid-stack-placeholder')) return null
        const id = item.getAttribute('gs-id') ?? item.dataset.fragmentId ?? null
        if (!id || id === dragStartId) return null
        return id
      }

      const collectOrder = () => {
        const nodes = grid.engine.nodes
          .filter((node) => node && (node.id || node.el))
          .slice()
          .sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0))
        return nodes
          .map((node) => (typeof node.id === 'string' ? node.id : node.el?.getAttribute('gs-id') ?? null))
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      }

      const syncOrder = () => {
        const nextOrder = collectOrder()
        if (!nextOrder.length) return
        if (nextOrder.join('|') !== orderIds.value.join('|')) {
          orderIds.value = nextOrder
          layoutTick.value += 1
        }
      }

      const swapOrder = (dragId: string, targetId: string) => {
        const current = orderIds.value.slice()
        const fromIndex = current.indexOf(dragId)
        const toIndex = current.indexOf(targetId)
        if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return false
        ;[current[fromIndex], current[toIndex]] = [current[toIndex], current[fromIndex]]
        orderIds.value = current
        layoutTick.value += 1
        return true
      }

      const handleDragStart = (_event: Event, el: HTMLElement) => {
        const id = el?.getAttribute('gs-id') ?? el?.dataset.fragmentId ?? null
        dragStartId = id
        dragTargetId = null
        dragState.value = {
          active: true,
          suppressUntil: 0,
          draggingId: id
        }
        gridEl.classList.add('is-dragging')
      }

      const handleDragMove = (event: Event) => {
        if (!dragStartId) return
        const point = getEventPoint(event)
        if (!point) return
        pendingPoint = point
        if (dragMoveFrame) return
        dragMoveFrame = requestAnimationFrame(() => {
          dragMoveFrame = 0
          if (!pendingPoint) return
          dragTargetId = resolveTargetId(pendingPoint)
          pendingPoint = null
        })
      }

      const handleDragStop = (event: Event, el: HTMLElement) => {
        dragState.value = {
          active: false,
          suppressUntil: Date.now() + 300,
          draggingId: null
        }
        gridEl.classList.remove('is-dragging')
        if (dragMoveFrame) {
          cancelAnimationFrame(dragMoveFrame)
          dragMoveFrame = 0
        }
        const point = getEventPoint(event)
        if (point) {
          const resolvedTarget = resolveTargetId(point)
          if (resolvedTarget) {
            dragTargetId = resolvedTarget
          }
        }
        const dragId = dragStartId
        const targetId = dragTargetId
        dragStartId = null
        dragTargetId = null
        pendingPoint = null
        if (dragId && targetId) {
          if (swapOrder(dragId, targetId)) return
        }
        const lock = el?.dataset.columnLock
        if (lock) {
          if (currentColumn === 1) {
            grid.update(el, { x: 0, w: 1, minW: 1, maxW: 1 })
          } else {
            const half = Math.max(1, Math.floor(GRIDSTACK_COLUMNS / 2))
            const x = lock === 'right' ? half : 0
            grid.update(el, { x, w: half })
          }
        }
        syncOrder()
      }

      grid.on('dragstart', handleDragStart)
      grid.on('drag', handleDragMove)
      grid.on('dragstop', handleDragStop)

      ctx.cleanup(() => {
        grid.off('dragstart')
        grid.off('drag')
        grid.off('dragstop')
        grid.destroy(false)
        delete gridEl.dataset.dragReady
        gridEl.classList.remove('is-dragging')
        mutationObserver?.disconnect()
        resizeObserver?.disconnect()
        if (heightFrame) cancelAnimationFrame(heightFrame)
        if (resizeFrame) cancelAnimationFrame(resizeFrame)
        if (dragMoveFrame) cancelAnimationFrame(dragMoveFrame)
        window.removeEventListener('resize', scheduleResize)
      })
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$(
    (ctx) => {
      if (typeof window === 'undefined') return
      ctx.track(() => orderIds.value)
      ctx.track(() => dragState.value.active)
      const gridEl = gridRef.value as GridStackElement | undefined
      if (!gridEl || !gridEl.gridstack) return
      if (dragState.value.active) return
      syncGridFromDom(gridEl)
      syncGridHeights(gridEl)
    },
    { strategy: 'document-ready' }
  )
}
