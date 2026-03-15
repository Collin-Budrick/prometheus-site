type LayoutSnapshotRect = {
  top: number
  right: number
  bottom: number
  left: number
  width: number
  height: number
}

type LayoutSnapshotOptions = {
  win?: Pick<Window, 'innerWidth' | 'innerHeight'> | null
  doc?: Pick<Document, 'documentElement'> | null
}

const toLayoutSnapshotRect = (rect: DOMRect | DOMRectReadOnly): LayoutSnapshotRect => ({
  top: rect.top,
  right: rect.right,
  bottom: rect.bottom,
  left: rect.left,
  width: typeof rect.width === 'number' ? rect.width : rect.right - rect.left,
  height: typeof rect.height === 'number' ? rect.height : rect.bottom - rect.top
})

export const createLayoutSnapshot = ({
  win = typeof window !== 'undefined' ? window : null,
  doc = typeof document !== 'undefined' ? document : null
}: LayoutSnapshotOptions = {}) => {
  const viewportWidth =
    typeof win?.innerWidth === 'number' ? win.innerWidth : doc?.documentElement?.clientWidth ?? 0
  const viewportHeight =
    typeof win?.innerHeight === 'number' ? win.innerHeight : doc?.documentElement?.clientHeight ?? 0
  const rectCache = new WeakMap<Element, LayoutSnapshotRect>()

  const readRect = (element: Element) => {
    const cached = rectCache.get(element)
    if (cached) {
      return cached
    }
    if (typeof (element as HTMLElement).getBoundingClientRect !== 'function') {
      return null
    }

    const nextRect = toLayoutSnapshotRect((element as HTMLElement).getBoundingClientRect())
    rectCache.set(element, nextRect)
    return nextRect
  }

  return {
    viewportWidth,
    viewportHeight,
    readRect,
    isVisible(element: Element) {
      const rect = readRect(element)
      if (!rect || viewportWidth <= 0 || viewportHeight <= 0) {
        return true
      }

      return (
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < viewportHeight &&
        rect.left < viewportWidth
      )
    }
  }
}
