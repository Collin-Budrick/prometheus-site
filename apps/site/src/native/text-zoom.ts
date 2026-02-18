const TEXT_ZOOM_STORAGE_KEY = 'prometheus:text-zoom-percent'
const MIN_TEXT_ZOOM = 85
const MAX_TEXT_ZOOM = 140

const clampZoom = (value: number) => Math.max(MIN_TEXT_ZOOM, Math.min(MAX_TEXT_ZOOM, Math.round(value)))

export const getStoredTextZoom = () => {
  if (typeof window === 'undefined') return 100
  try {
    const raw = Number(window.localStorage.getItem(TEXT_ZOOM_STORAGE_KEY) || '100')
    if (!Number.isFinite(raw)) return 100
    return clampZoom(raw)
  } catch {
    return 100
  }
}

const persistTextZoom = (value: number) => {
  try {
    window.localStorage.setItem(TEXT_ZOOM_STORAGE_KEY, String(clampZoom(value)))
  } catch {
    // no-op
  }
}

export const applyTextZoom = async (percent: number) => {
  const zoom = clampZoom(percent)
  if (typeof document !== 'undefined') {
    document.documentElement.style.fontSize = `${zoom}%`
  }
  persistTextZoom(zoom)
}

let initialized = false

export const initNativeTextZoom = async () => {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  const stored = getStoredTextZoom()
  await applyTextZoom(stored)
}
