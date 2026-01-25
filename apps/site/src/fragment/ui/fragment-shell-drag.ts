import { useVisibleTask$, type Signal } from '@builder.io/qwik'
import { GridStack } from 'gridstack'
import type { FragmentDragState } from './fragment-shell-types'
import {
  GRIDSTACK_CELL_HEIGHT,
  GRIDSTACK_COLUMNS,
  GRIDSTACK_MARGIN,
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
  grid.batchUpdate()
  items.forEach((item) => {
    const x = toNumber(item.getAttribute('gs-x'), 0)
    const y = toNumber(item.getAttribute('gs-y'), 0)
    const w = toNumber(item.getAttribute('gs-w'), 1)
    const h = toNumber(item.getAttribute('gs-h'), 1)
    grid.update(item, { x, y, w, h })
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

      const grid = GridStack.init(
        {
          column: GRIDSTACK_COLUMNS,
          cellHeight: GRIDSTACK_CELL_HEIGHT,
          margin: GRIDSTACK_MARGIN,
          sizeToContent: true,
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

      const scheduleHeightSync = () => {
        if (heightFrame) return
        heightFrame = requestAnimationFrame(() => {
          heightFrame = 0
          if (dragState.value.active) return
          const measured = syncGridHeights(gridEl)
          if (!ready && measured) {
            ready = true
            gridEl.dataset.dragReady = 'true'
          }
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

      const handleDragStop = () => {
        dragState.value = {
          active: false,
          suppressUntil: Date.now() + 300,
          draggingId: null
        }
        gridEl.classList.remove('is-dragging')
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
