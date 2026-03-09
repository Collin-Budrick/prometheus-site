import { noSerialize, useSignal, useVisibleTask$, type NoSerialize, type Signal } from '@builder.io/qwik'
import { isStaticHomeShellMode } from './fragment-shell-mode'
import type { FragmentDragState, FragmentShellMode } from './fragment-shell-types'
import {
  GRIDSTACK_CELL_HEIGHT,
  GRIDSTACK_COLUMNS,
  GRIDSTACK_MARGIN,
  DESKTOP_MIN_WIDTH
} from './fragment-shell-utils'
import type {
  FragmentShellCapturedDragIntent,
  FragmentShellDragRuntimeController
} from './fragment-shell-drag-runtime'

type FragmentShellDragOptions = {
  shellMode: FragmentShellMode
  orderIds: Signal<string[]>
  columnSplit: Signal<number>
  dragState: Signal<FragmentDragState>
  layoutTick: Signal<number>
  gridRef: Signal<HTMLDivElement | undefined>
}

const toGridRows = (heightPx: number) =>
  Math.max(1, Math.ceil((heightPx + GRIDSTACK_MARGIN * 2) / GRIDSTACK_CELL_HEIGHT))

const heightCache = new WeakMap<HTMLElement, number>()

const getColumnCount = () => (window.innerWidth < DESKTOP_MIN_WIDTH ? 1 : GRIDSTACK_COLUMNS)

const applyStaticLayout = (gridEl: HTMLDivElement) => {
  const items = Array.from(gridEl.querySelectorAll<HTMLElement>('.grid-stack-item'))
  if (!items.length) return false
  const isMobile = getColumnCount() === 1
  const half = Math.max(1, Math.floor(GRIDSTACK_COLUMNS / 2))
  let leftY = 0
  let rightY = 0
  let singleY = 0
  let measured = false

  items.forEach((item) => {
    const card = item.querySelector<HTMLElement>('.fragment-card') ?? item
    const height = card.getBoundingClientRect().height
    const fallbackRows = Math.max(1, Number(item.getAttribute('gs-h')) || 1)
    const rows = Number.isFinite(height) && height > 0 ? toGridRows(height) : heightCache.get(item) ?? fallbackRows
    if (Number.isFinite(height) && height > 0) {
      measured = true
      heightCache.set(item, rows)
    }

    if (isMobile) {
      const y = singleY
      singleY += rows
      item.setAttribute('gs-x', '0')
      item.setAttribute('gs-y', String(y))
      item.setAttribute('gs-w', '1')
      item.setAttribute('gs-h', String(rows))
      item.setAttribute('gs-min-w', '1')
      item.setAttribute('gs-max-w', '1')
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
  })

  return measured
}

const captureDragIntent = (event: Event): FragmentShellCapturedDragIntent | null => {
  const target = event.target instanceof Element ? event.target : null
  const handle = target?.closest<HTMLElement>('[data-drag-handle]')
  if (!handle) return null
  const item = handle.closest<HTMLElement>('.grid-stack-item')
  const itemId = item?.getAttribute('gs-id') ?? item?.dataset.fragmentId ?? null
  if (!itemId) return null

  if ('clientX' in event && 'clientY' in event) {
    const source = event as MouseEvent
    return {
      itemId,
      clientX: source.clientX,
      clientY: source.clientY,
      button: source.button,
      buttons: source.buttons || 1,
      ctrlKey: source.ctrlKey,
      altKey: source.altKey,
      shiftKey: source.shiftKey,
      metaKey: source.metaKey
    }
  }

  if ('touches' in event || 'changedTouches' in event) {
    const touchEvent = event as TouchEvent
    const touch = touchEvent.touches[0] ?? touchEvent.changedTouches[0]
    if (!touch) return null
    return {
      itemId,
      clientX: touch.clientX,
      clientY: touch.clientY,
      button: 0,
      buttons: 1,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false
    }
  }

  return null
}

export const useFragmentShellDrag = ({
  shellMode,
  orderIds,
  columnSplit,
  dragState,
  layoutTick,
  gridRef
}: FragmentShellDragOptions) => {
  const runtimeController = useSignal<NoSerialize<FragmentShellDragRuntimeController> | undefined>(undefined)
  const pendingIntent = useSignal<FragmentShellCapturedDragIntent | null>(null)

  useVisibleTask$(
    (ctx) => {
      if (isStaticHomeShellMode(shellMode)) return
      if (typeof window === 'undefined') return
      ctx.track(() => gridRef.value)
      const gridEl = gridRef.value
      if (!gridEl) return

      let cancelled = false
      let runtimePromise: Promise<FragmentShellDragRuntimeController> | null = null

      const loadRuntime = async () => {
        const existing = runtimeController.value
        if (existing) return existing
        if (!runtimePromise) {
          runtimePromise = import('./fragment-shell-drag-runtime')
            .then(({ activateFragmentShellDragRuntime }) =>
              activateFragmentShellDragRuntime({
                gridEl,
                orderIds,
                columnSplit,
                dragState,
                layoutTick
              })
            )
            .then((controller) => {
              if (cancelled) {
                controller.destroy()
                return controller
              }
              runtimeController.value = noSerialize(controller)
              const intent = pendingIntent.value
              pendingIntent.value = null
              if (intent) {
                controller.replayGesture(intent)
              }
              return controller
            })
        }
        return runtimePromise
      }

      const handleIntent = (event: Event) => {
        if (runtimeController.value) return
        const intent = captureDragIntent(event)
        if (!intent) return
        pendingIntent.value = intent
        void loadRuntime()
      }

      gridEl.addEventListener('pointerdown', handleIntent, true)
      gridEl.addEventListener('mousedown', handleIntent, true)

      ctx.cleanup(() => {
        cancelled = true
        gridEl.removeEventListener('pointerdown', handleIntent, true)
        gridEl.removeEventListener('mousedown', handleIntent, true)
        runtimeController.value?.destroy()
        runtimeController.value = undefined
        pendingIntent.value = null
      })
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$(
    (ctx) => {
      if (isStaticHomeShellMode(shellMode)) return
      if (typeof window === 'undefined') return
      ctx.track(() => gridRef.value)
      ctx.track(() => layoutTick.value)
      ctx.track(() => dragState.value.active)
      const gridEl = gridRef.value
      if (!gridEl || dragState.value.active) return

      let frame = window.requestAnimationFrame(() => {
        frame = 0
        const controller = runtimeController.value
        if (controller) {
          controller.syncLayout()
          return
        }
        applyStaticLayout(gridEl)
      })

      ctx.cleanup(() => {
        if (frame) {
          window.cancelAnimationFrame(frame)
        }
      })
    },
    { strategy: 'document-ready' }
  )
}
