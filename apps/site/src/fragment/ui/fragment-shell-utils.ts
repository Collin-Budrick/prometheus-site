import type { FieldSnapshot } from './shell-cache'
import type { BentoSlot, FragmentPlanEntry } from './fragment-shell-types'

export const DESKTOP_MIN_WIDTH = 1025
export const ORDER_STORAGE_PREFIX = 'fragment:card-order:v1'
export const DRAG_HOLD_MS = 240
export const DRAG_MOVE_THRESHOLD = 6
export const DRAG_SCROLL_EDGE_PX = 90
export const DRAG_SCROLL_MAX_PX = 20
export const DRAG_SWAP_HOVER_MS = 140
export const DRAG_REORDER_DURATION_MS = 260
export const DRAG_REORDER_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
export const INTERACTIVE_SELECTOR =
  'a, button, input, textarea, select, option, [role="button"], [contenteditable="true"], [data-fragment-link]'
export const GRIDSTACK_COLUMNS = 12
export const GRIDSTACK_CELL_HEIGHT = 8
export const GRIDSTACK_MARGIN = 12

const BENTO_SLOTS_PER_CYCLE = 6
const BENTO_ROWS_PER_CYCLE = 4

export const getFieldKey = (field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, index: number) => {
  const fragmentId = (field.closest('[data-fragment-id]') as HTMLElement | null)?.dataset.fragmentId ?? 'shell'
  const name = field.getAttribute('name') ?? field.getAttribute('id')
  const base = name && name.trim().length ? name.trim() : `field-${index}`
  if (field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio')) {
    const valueToken = field.value && field.value.length ? field.value : 'on'
    return `${fragmentId}::${base}::${valueToken}`
  }
  return `${fragmentId}::${base}`
}

export const collectFieldSnapshots = (root: HTMLElement) => {
  const snapshots: Record<string, FieldSnapshot> = {}
  const fields = root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    'input, textarea, select'
  )
  fields.forEach((field, index) => {
    const key = getFieldKey(field, index)
    if (field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio')) {
      snapshots[key] = { key, checked: field.checked }
      return
    }
    snapshots[key] = { key, value: field.value }
  })
  return snapshots
}

export const applyFieldSnapshots = (root: HTMLElement, snapshots: Record<string, FieldSnapshot>) => {
  const fields = root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    'input, textarea, select'
  )
  fields.forEach((field, index) => {
    const key = getFieldKey(field, index)
    const snapshot = snapshots[key]
    if (!snapshot) return
    if (field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio')) {
      if (typeof snapshot.checked === 'boolean') {
        field.checked = snapshot.checked
      }
      return
    }
    if (snapshot.value !== undefined) {
      field.value = snapshot.value
    }
  })
}

export const parseStoredOrder = (raw: string | null) => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string') ? parsed : []
  } catch {
    return []
  }
}

export const buildOrderedIds = (entries: FragmentPlanEntry[], stored: string[]) => {
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

export const buildOrderedEntries = (entries: FragmentPlanEntry[], orderIds: string[]) => {
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

export const parseSlotRows = (row: string) => {
  const startMatch = row.match(/^\s*(\d+)/)
  if (!startMatch) return []
  const start = Number.parseInt(startMatch[1] ?? '', 10)
  if (!Number.isFinite(start)) return []
  const spanMatch = row.match(/span\s+(\d+)/i)
  const span = spanMatch ? Number.parseInt(spanMatch[1] ?? '', 10) : 1
  const safeSpan = Number.isFinite(span) && span > 0 ? span : 1
  return Array.from({ length: safeSpan }, (_, index) => start + index)
}

const parseSlotColumn = (column: string) => {
  const normalized = column.trim().replace(/\s+/g, ' ')
  if (normalized.includes('/ -1') || normalized.includes('/-1')) {
    return { x: 0, w: GRIDSTACK_COLUMNS }
  }
  const match = normalized.match(/^(\d+)\s*\/\s*span\s+(\d+)$/)
  if (match) {
    const start = Number.parseInt(match[1] ?? '', 10)
    const span = Number.parseInt(match[2] ?? '', 10)
    if (Number.isFinite(start) && Number.isFinite(span)) {
      return { x: Math.max(0, start - 1), w: span }
    }
  }
  const spanMatch = normalized.match(/span\s+(\d+)/)
  if (spanMatch) {
    const span = Number.parseInt(spanMatch[1] ?? '', 10)
    if (Number.isFinite(span)) {
      return { x: 0, w: span }
    }
  }
  return { x: 0, w: GRIDSTACK_COLUMNS }
}

export const getGridstackSlotMetrics = (slot: BentoSlot, index: number) => {
  const rows = parseSlotRows(slot.row)
  const rowStart = rows[0] ?? 1
  const y = Math.max(0, rowStart - 1)
  const h = 1
  const { x: rawX, w: rawW } = parseSlotColumn(slot.column)
  const half = Math.max(1, Math.floor(GRIDSTACK_COLUMNS / 2))
  let column: 'left' | 'right' = rawX >= half ? 'right' : 'left'
  if (rawW > half) {
    column = index % 2 === 0 ? 'left' : 'right'
  }
  const x = column === 'right' ? half : 0
  const w = half
  return {
    x,
    y,
    w,
    h: Math.max(1, h),
    column
  }
}

export const buildBentoSlots = (count: number) => {
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
