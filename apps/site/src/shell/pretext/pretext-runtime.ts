import { layout, prepare, setLocale } from '@chenglou/pretext'
import { createPretextAdapter } from './pretext-core'

let sharedCanvasContext: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null

const getSharedCanvasContext = () => {
  if (sharedCanvasContext) {
    return sharedCanvasContext
  }

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    sharedCanvasContext = canvas.getContext('2d')
    return sharedCanvasContext
  }

  if (typeof OffscreenCanvas !== 'undefined') {
    sharedCanvasContext = new OffscreenCanvas(1, 1).getContext('2d')
    return sharedCanvasContext
  }

  return null
}

const fallbackTextWidth = (text: string, font: string) => {
  const fontSizeMatch = font.match(/(\d+(?:\.\d+)?)px/i)
  const fontSize = fontSizeMatch ? Number.parseFloat(fontSizeMatch[1] ?? '16') : 16
  return text.length * fontSize * 0.62
}

export const pretextAdapter = createPretextAdapter({
  layout,
  measureTextWidth: (text, font) => {
    const context = getSharedCanvasContext()
    if (!context) {
      return fallbackTextWidth(text, font)
    }
    context.font = font
    return context.measureText(text).width
  },
  prepare,
  setLocale
})
