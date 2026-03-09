import 'gridstack/dist/gridstack.min.css'

import type { Signal } from '@builder.io/qwik'
import { GridStack } from 'gridstack'
import type { FragmentDragState } from './fragment-shell-types'
import {
  GRIDSTACK_CELL_HEIGHT,
  GRIDSTACK_COLUMNS,
  GRIDSTACK_MARGIN,
  DESKTOP_MIN_WIDTH,
  DRAG_MOVE_THRESHOLD,
  INTERACTIVE_SELECTOR
} from './fragment-shell-utils'

type GridStackElement = HTMLDivElement & { gridstack?: GridStack }

type FragmentShellDragRuntimeOptions = {
  gridEl: HTMLDivElement
  orderIds: Signal<string[]>
  columnSplit: Signal<number>
  dragState: Signal<FragmentDragState>
  layoutTick: Signal<number>
}

export type FragmentShellCapturedDragIntent = {
  itemId: string
  clientX: number
  clientY: number
  button: number
  buttons: number
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

export type FragmentShellDragRuntimeController = {
  destroy: () => void
  replayGesture: (intent: FragmentShellCapturedDragIntent) => boolean
  syncLayout: () => void
}

type GridStackDragTarget = HTMLElement & {
  ddElement?: {
    ddDraggable?: {
      _mouseDown?: (event: MouseEvent | Event) => void
    }
  }
}

const toGridRows = (heightPx: number) =>
  Math.max(1, Math.ceil((heightPx + GRIDSTACK_MARGIN * 2) / GRIDSTACK_CELL_HEIGHT))

const heightCache = new WeakMap<HTMLElement, number>()

const toNumber = (value: string | null, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const getColumnCount = () => (window.innerWidth < DESKTOP_MIN_WIDTH ? 1 : GRIDSTACK_COLUMNS)

const syncGridFromDom = (gridEl: GridStackElement) => {
  const grid = gridEl.gridstack
  if (!grid) return
  const items = Array.from(gridEl.querySelectorAll<HTMLElement>('.grid-stack-item'))
  const isMobile = getColumnCount() === 1
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
    grid.update(item, { x, y, w, h, minW, maxW, noResize: true })
  })
  grid.batchUpdate(false)
}

const syncGridHeights = (gridEl: GridStackElement) => {
  const grid = gridEl.gridstack
  if (!grid) return false
  const items = Array.from(gridEl.querySelectorAll<HTMLElement>('.grid-stack-item'))
  const isMobile = getColumnCount() === 1
  const half = Math.max(1, Math.floor(GRIDSTACK_COLUMNS / 2))
  const nextRows = new Map<HTMLElement, number>()
  let measured = false

  items.forEach((item) => {
    const card = item.querySelector<HTMLElement>('.fragment-card') ?? item
    const height = card.getBoundingClientRect().height
    if (!Number.isFinite(height) || height <= 0) return
    measured = true
    const rows = toGridRows(height)
    nextRows.set(item, rows)
  })

  if (!measured) return false

  let leftY = 0
  let rightY = 0
  let singleY = 0

  grid.batchUpdate()
  items.forEach((item) => {
    const fallbackRows = Math.max(1, Number(item.getAttribute('gs-h')) || 1)
    const rows = nextRows.get(item) ?? heightCache.get(item) ?? fallbackRows
    heightCache.set(item, rows)

    if (isMobile) {
      const y = singleY
      singleY += rows
      item.setAttribute('gs-x', '0')
      item.setAttribute('gs-y', String(y))
      item.setAttribute('gs-w', '1')
      item.setAttribute('gs-h', String(rows))
      item.setAttribute('gs-min-w', '1')
      item.setAttribute('gs-max-w', '1')
      grid.update(item, { x: 0, y, w: 1, h: rows, minW: 1, maxW: 1, noResize: true })
      return
    }

    const lock = item.dataset.columnLock
    const column =
      lock === 'right'
        ? 'right'
        : lock === 'left'
          ? 'left'
          : Number(item.getAttribute('gs-x')) >= half
            ? 'right'
            : 'left'
    const x = column === 'right' ? half : 0
    const y = column === 'right' ? rightY : leftY
    if (column === 'right') {
      rightY += rows
    } else {
      leftY += rows
    }

    item.setAttribute('gs-x', String(x))
    item.setAttribute('gs-y', String(y))
    item.setAttribute('gs-w', String(half))
    item.setAttribute('gs-h', String(rows))
    item.setAttribute('gs-min-w', String(half))
    item.setAttribute('gs-max-w', String(half))
    grid.update(item, { x, y, w: half, h: rows, minW: half, maxW: half, noResize: true })
  })
  grid.batchUpdate(false)
  return measured
}

const escapeSelector = (value: string) => {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
  return value.replace(/["\\]/g, '\\$&')
}

const clampSplit = (value: number, length: number) => Math.max(0, Math.min(length, value))

const clampInsertIndex = (index: number, column: 'left' | 'right', split: number, length: number) => {
  if (column === 'left') {
    const maxIndex = Math.max(0, split - 1)
    return Math.min(Math.max(0, index), maxIndex)
  }
  return Math.min(Math.max(split, index), length)
}

const getColumnForIndex = (index: number, split: number) => (index < split ? 'left' : 'right')

const resolveDropColumn = (
  gridEl: HTMLElement,
  point: { x: number; y: number } | null,
  rect: DOMRect | null
) => {
  const gridRect = gridEl.getBoundingClientRect()
  const midX = gridRect.left + gridRect.width / 2
  const probeX = point?.x ?? (rect ? rect.left + rect.width / 2 : undefined)
  if (probeX === undefined) return null
  return probeX < midX ? 'left' : 'right'
}

const createMouseEvent = (
  handle: HTMLElement,
  intent: FragmentShellCapturedDragIntent
): MouseEvent | Event => {
  const event = new MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
    button: intent.button,
    buttons: intent.buttons || 1,
    clientX: intent.clientX,
    clientY: intent.clientY,
    ctrlKey: intent.ctrlKey,
    altKey: intent.altKey,
    shiftKey: intent.shiftKey,
    metaKey: intent.metaKey,
    view: window
  })

  try {
    Object.defineProperty(event, 'target', { configurable: true, value: handle })
    Object.defineProperty(event, 'currentTarget', { configurable: true, value: handle })
    return event
  } catch {
    return {
      ...event,
      target: handle,
      currentTarget: handle
    } as MouseEvent
  }
}

export const activateFragmentShellDragRuntime = async ({
  gridEl,
  orderIds,
  columnSplit,
  dragState,
  layoutTick
}: FragmentShellDragRuntimeOptions): Promise<FragmentShellDragRuntimeController> => {
  const gridElement = gridEl as GridStackElement
  const initialColumn = getColumnCount()
  let currentColumn = initialColumn
  let ready = false
  let dragMoveFrame = 0
  let dragStartId: string | null = null
  let dragTargetId: string | null = null
  let dragStartOrder: string[] | null = null
  let dragStartSplit: number | null = null
  let dragStartPoint: { x: number; y: number } | null = null
  let pendingPoint: { x: number; y: number } | null = null
  let lastDragPoint: { x: number; y: number } | null = null
  let releaseHandlersActive = false

  const grid = GridStack.init(
    {
      column: initialColumn,
      cellHeight: GRIDSTACK_CELL_HEIGHT,
      margin: GRIDSTACK_MARGIN,
      disableResize: true,
      float: false,
      animate: false,
      draggable: {
        handle: '.fragment-card-drag',
        cancel: INTERACTIVE_SELECTOR,
        scroll: true,
        appendTo: 'body'
      }
    },
    gridElement
  )

  const hasGridVars = () => {
    const style = window.getComputedStyle(gridElement)
    const columnWidth = Number.parseFloat(style.getPropertyValue('--gs-column-width'))
    const cellHeight = Number.parseFloat(style.getPropertyValue('--gs-cell-height'))
    return Number.isFinite(columnWidth) && columnWidth > 0 && Number.isFinite(cellHeight) && cellHeight > 0
  }

  const maybeSetReady = (measured: boolean) => {
    if (ready || !measured || !hasGridVars()) return
    ready = true
    gridElement.dataset.dragReady = 'true'
  }

  const syncLayout = () => {
    const nextColumn = getColumnCount()
    if (nextColumn !== currentColumn) {
      currentColumn = nextColumn
      grid.column(nextColumn, 'move')
    }
    syncGridFromDom(gridElement)
    maybeSetReady(syncGridHeights(gridElement))
  }

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

  const findItemById = (id: string) => {
    const escaped = escapeSelector(id)
    return gridElement.querySelector<GridStackDragTarget>(`.grid-stack-item[gs-id="${escaped}"]`)
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

  const resolveTargetIdFromRect = (rect: DOMRect, sourceId: string) => {
    const items = Array.from(gridElement.querySelectorAll<HTMLElement>('.grid-stack-item')).filter(
      (item) => !item.classList.contains('grid-stack-placeholder')
    )
    let bestId: string | null = null
    let bestArea = 0
    let bestDistance = Number.POSITIVE_INFINITY
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    items.forEach((item) => {
      const id = item.getAttribute('gs-id') ?? item.dataset.fragmentId ?? null
      if (!id || id === sourceId) return
      const box = item.getBoundingClientRect()
      const overlapX = Math.min(rect.right, box.right) - Math.max(rect.left, box.left)
      const overlapY = Math.min(rect.bottom, box.bottom) - Math.max(rect.top, box.top)
      const area = Math.max(0, overlapX) * Math.max(0, overlapY)
      if (area > bestArea) {
        bestArea = area
        bestId = id
        return
      }
      if (bestArea > 0) return
      const dx = centerX - (box.left + box.width / 2)
      const dy = centerY - (box.top + box.height / 2)
      const distance = dx * dx + dy * dy
      if (distance < bestDistance) {
        bestDistance = distance
        bestId = id
      }
    })
    return bestId
  }

  const resolvePlaceholderTarget = (
    order: string[],
    column: 'left' | 'right',
    split: number,
    anchorY: number,
    excludeId: string
  ) => {
    const ids = column === 'left' ? order.slice(0, split) : order.slice(split)
    const items = ids
      .filter((id) => id !== excludeId)
      .map((id) => {
        const el = findItemById(id)
        const rect = el?.getBoundingClientRect()
        return rect ? { id, rect } : null
      })
      .filter((value): value is { id: string; rect: DOMRect } => Boolean(value))
      .sort((a, b) => a.rect.top - b.rect.top)
    if (!items.length) return { targetId: null, insertAfter: true }
    const match = items.find((item) => anchorY < item.rect.top + item.rect.height / 2)
    if (match) {
      return { targetId: match.id, insertAfter: false }
    }
    return { targetId: null, insertAfter: true }
  }

  const snapPlaceholderToColumn = (point: { x: number; y: number } | null) => {
    if (currentColumn === 1) return
    const placeholder = gridElement.querySelector<HTMLElement>('.grid-stack-placeholder')
    if (!placeholder) return
    const placeholderRect = placeholder.getBoundingClientRect()
    const dropColumn = resolveDropColumn(gridElement, point, placeholderRect)
    if (!dropColumn) return
    const half = Math.max(1, Math.floor(GRIDSTACK_COLUMNS / 2))
    const x = dropColumn === 'right' ? half : 0
    const w = half
    placeholder.style.left = x === 0 ? '' : `calc(${x} * var(--gs-column-width))`
    placeholder.style.width = `calc(${w} * var(--gs-column-width))`
    placeholder.setAttribute('gs-x', String(x))
    placeholder.setAttribute('gs-w', String(w))
    const node = (placeholder as HTMLElement & { gridstackNode?: { x?: number; w?: number } }).gridstackNode
    if (node) {
      node.x = x
      node.w = w
    }
  }

  const releaseGlobalDrag = () => {
    if (dragState.value.active) {
      dragState.value = {
        active: false,
        suppressUntil: Date.now() + 300,
        draggingId: null
      }
    }
    gridElement.classList.remove('is-dragging')
    gridElement.style.touchAction = ''
    document.body.style.touchAction = ''
    document.documentElement.style.touchAction = ''
  }

  const addReleaseHandlers = () => {
    if (releaseHandlersActive) return
    releaseHandlersActive = true
    window.addEventListener('pointerup', releaseGlobalDrag, { capture: true, passive: true })
    window.addEventListener('pointercancel', releaseGlobalDrag, { capture: true, passive: true })
    window.addEventListener('mouseup', releaseGlobalDrag, { capture: true, passive: true })
    window.addEventListener('touchend', releaseGlobalDrag, { capture: true, passive: true })
    window.addEventListener('touchcancel', releaseGlobalDrag, { capture: true, passive: true })
  }

  const removeReleaseHandlers = () => {
    if (!releaseHandlersActive) return
    releaseHandlersActive = false
    window.removeEventListener('pointerup', releaseGlobalDrag, true)
    window.removeEventListener('pointercancel', releaseGlobalDrag, true)
    window.removeEventListener('mouseup', releaseGlobalDrag, true)
    window.removeEventListener('touchend', releaseGlobalDrag, true)
    window.removeEventListener('touchcancel', releaseGlobalDrag, true)
  }

  const applyOrder = (nextOrder: string[], nextSplit: number) => {
    const orderChanged = nextOrder.join('|') !== orderIds.value.join('|')
    const splitChanged = nextSplit !== columnSplit.value
    if (orderChanged) {
      orderIds.value = nextOrder
    }
    if (splitChanged) {
      columnSplit.value = nextSplit
    }
    if (orderChanged || splitChanged) {
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

  const moveAcrossColumns = (
    current: string[],
    fromIndex: number,
    targetId: string | null,
    targetColumn: 'left' | 'right',
    insertAfter: boolean,
    split: number
  ) => {
    const next = current.slice()
    const [dragId] = next.splice(fromIndex, 1)
    const nextSplit = clampSplit(split + (targetColumn === 'left' ? 1 : -1), next.length)
    let insertIndex: number
    if (targetId) {
      const targetIndex = next.indexOf(targetId)
      if (targetIndex === -1) {
        insertIndex = targetColumn === 'left' ? nextSplit - 1 : next.length
      } else {
        insertIndex = targetIndex + (insertAfter ? 1 : 0)
      }
    } else {
      insertIndex = targetColumn === 'left' ? nextSplit - 1 : next.length
    }
    insertIndex = clampInsertIndex(insertIndex, targetColumn, nextSplit, next.length)
    next.splice(insertIndex, 0, dragId)
    return { order: next, split: nextSplit }
  }

  const handleDragStart = (event: Event, el: HTMLElement) => {
    const id = el.getAttribute('gs-id') ?? el.dataset.fragmentId ?? null
    dragStartId = id
    dragTargetId = null
    dragStartOrder = orderIds.value.slice()
    dragStartSplit = columnSplit.value
    const point = getEventPoint(event)
    if (point) {
      dragStartPoint = point
    } else {
      const rect = el.getBoundingClientRect()
      dragStartPoint = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    }
    dragState.value = {
      active: true,
      suppressUntil: 0,
      draggingId: id
    }
    gridElement.classList.add('is-dragging')
    addReleaseHandlers()
  }

  const handleDragMove = (event: Event) => {
    if (!dragStartId) return
    const point = getEventPoint(event)
    if (!point) return
    lastDragPoint = point
    pendingPoint = point
    if (dragMoveFrame) return
    dragMoveFrame = requestAnimationFrame(() => {
      dragMoveFrame = 0
      if (!pendingPoint) return
      dragTargetId = resolveTargetId(pendingPoint)
      snapPlaceholderToColumn(pendingPoint)
      pendingPoint = null
    })
  }

  const handleDragStop = (event: Event, el: HTMLElement) => {
    dragState.value = {
      active: false,
      suppressUntil: Date.now() + 300,
      draggingId: null
    }
    gridElement.classList.remove('is-dragging')
    gridElement.style.touchAction = ''
    document.body.style.touchAction = ''
    document.documentElement.style.touchAction = ''
    removeReleaseHandlers()
    if (dragMoveFrame) {
      cancelAnimationFrame(dragMoveFrame)
      dragMoveFrame = 0
    }

    const dragId = dragStartId
    const rect = el.getBoundingClientRect()
    const point = getEventPoint(event) ?? lastDragPoint
    const pointerTarget = point ? resolveTargetId(point) : null
    const rectTarget = dragId ? resolveTargetIdFromRect(rect, dragId) : null
    const placeholder = gridElement.querySelector<HTMLElement>('.grid-stack-placeholder')
    const placeholderRect = placeholder?.getBoundingClientRect() ?? null
    const dropColumn = resolveDropColumn(gridElement, point, rect ?? placeholderRect)
    let targetId = pointerTarget ?? rectTarget ?? dragTargetId
    let insertAfter = true
    dragStartId = null
    dragTargetId = null
    const startOrder = dragStartOrder
    dragStartOrder = null
    const startSplit = dragStartSplit
    dragStartSplit = null
    const startPoint = dragStartPoint
    dragStartPoint = null
    pendingPoint = null
    lastDragPoint = null

    if (dragId) {
      const current = orderIds.value.slice()
      const split = clampSplit(columnSplit.value, current.length)
      const fromIndex = current.indexOf(dragId)
      if (fromIndex !== -1) {
        const dragColumn = getColumnForIndex(fromIndex, split)
        const dropPoint = point ?? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        if (startPoint) {
          const dx = dropPoint.x - startPoint.x
          const dy = dropPoint.y - startPoint.y
          if (dx * dx + dy * dy <= DRAG_MOVE_THRESHOLD * DRAG_MOVE_THRESHOLD) {
            if (startOrder) {
              orderIds.value = startOrder
              if (startSplit !== null) {
                columnSplit.value = startSplit
              }
              layoutTick.value += 1
            }
            return
          }
        }

        if (placeholderRect && dropColumn) {
          const anchorY = point?.y ?? placeholderRect.top + placeholderRect.height / 2
          const placeholderTarget = resolvePlaceholderTarget(current, dropColumn, split, anchorY, dragId)
          targetId = placeholderTarget.targetId
          insertAfter = placeholderTarget.insertAfter
        } else if (targetId) {
          const targetEl = findItemById(targetId)
          const targetRect = targetEl?.getBoundingClientRect()
          const probeY = point?.y ?? targetRect?.top ?? 0
          insertAfter = targetRect ? probeY >= targetRect.top + targetRect.height / 2 : true
        }

        if (targetId) {
          const toIndex = current.indexOf(targetId)
          if (toIndex !== -1) {
            const targetColumn = getColumnForIndex(toIndex, split)
            if (dragColumn === targetColumn) {
              if (swapOrder(dragId, targetId)) return
            }
            const next = moveAcrossColumns(current, fromIndex, targetId, targetColumn, insertAfter, split)
            applyOrder(next.order, next.split)
            return
          }
        }

        if (dropColumn) {
          const next = moveAcrossColumns(current, fromIndex, null, dropColumn, true, split)
          applyOrder(next.order, next.split)
          return
        }
      }
    }

    if (startOrder) {
      orderIds.value = startOrder
      if (startSplit !== null) {
        columnSplit.value = startSplit
      }
      layoutTick.value += 1
    }

    const lock = el.dataset.columnLock
    if (lock) {
      if (currentColumn === 1) {
        grid.update(el, { x: 0, w: 1, minW: 1, maxW: 1 })
      } else {
        const half = Math.max(1, Math.floor(GRIDSTACK_COLUMNS / 2))
        const x = lock === 'right' ? half : 0
        grid.update(el, { x, w: half, minW: half, maxW: half })
      }
    }
  }

  grid.on('dragstart', handleDragStart)
  grid.on('drag', handleDragMove)
  grid.on('dragstop', handleDragStop)

  syncLayout()

  const replayGesture = (intent: FragmentShellCapturedDragIntent) => {
    const item = findItemById(intent.itemId)
    const handle = item?.querySelector<HTMLElement>('.fragment-card-drag')
    const mouseDown = item?.ddElement?.ddDraggable?._mouseDown
    if (!item || !handle || typeof mouseDown !== 'function') {
      if (import.meta.env.DEV) {
        console.warn('[fragment-shell-drag] unable to replay initial drag gesture; GridStack handle unavailable')
      }
      return false
    }
    mouseDown.call(item.ddElement?.ddDraggable, createMouseEvent(handle, intent))
    return true
  }

  return {
    destroy: () => {
      grid.off('dragstart')
      grid.off('drag')
      grid.off('dragstop')
      grid.destroy(false)
      delete gridElement.dataset.dragReady
      gridElement.classList.remove('is-dragging')
      gridElement.style.touchAction = ''
      document.body.style.touchAction = ''
      document.documentElement.style.touchAction = ''
      removeReleaseHandlers()
      if (dragMoveFrame) {
        cancelAnimationFrame(dragMoveFrame)
      }
    },
    replayGesture,
    syncLayout
  }
}
