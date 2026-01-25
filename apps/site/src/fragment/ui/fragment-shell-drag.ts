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

      const handleDragStart = (_event: Event, el: HTMLElement) => {
        const id = el?.getAttribute('gs-id') ?? el?.dataset.fragmentId ?? null
        dragState.value = {
          active: true,
          suppressUntil: 0,
          draggingId: id
        }
        gridEl.classList.add('is-dragging')
      }

      const handleDragStop = (_event: Event, el: HTMLElement) => {
        dragState.value = {
          active: false,
          suppressUntil: Date.now() + 300,
          draggingId: null
        }
        gridEl.classList.remove('is-dragging')
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
      grid.on('dragstop', handleDragStop)

      ctx.cleanup(() => {
        grid.off('dragstart')
        grid.off('dragstop')
        grid.destroy(false)
        delete gridEl.dataset.dragReady
        gridEl.classList.remove('is-dragging')
        mutationObserver?.disconnect()
        resizeObserver?.disconnect()
        if (heightFrame) cancelAnimationFrame(heightFrame)
        if (resizeFrame) cancelAnimationFrame(resizeFrame)
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
