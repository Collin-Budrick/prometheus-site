import { H, type HighlightOptions } from 'highlight.run'
import type { HighlightConfig } from './env'

type ErrorMetadata = Record<string, unknown>
let highlightInitialized = false

const normalizeError = (error: unknown) => {
  if (error instanceof Error) return error
  if (typeof error === 'string') return new Error(error)
  return new Error('Unknown client error')
}

const normalizeMetadata = (metadata: ErrorMetadata) => {
  const { source, ...payload } = metadata
  const normalizedSource = typeof source === 'string' ? source : undefined
  return {
    source: normalizedSource,
    payload: Object.keys(payload).length ? payload : undefined
  }
}

const buildHighlightOptions = (config: HighlightConfig, apiBase?: string): HighlightOptions => {
  const tracingOrigins = apiBase ? [apiBase] : true
  const options: HighlightOptions = {
    serviceName: config.serviceName,
    environment: config.environment,
    privacySetting: config.privacySetting,
    disableSessionRecording: !config.enableSessionRecording,
    enableCanvasRecording: config.enableCanvasRecording,
    reportConsoleErrors: true,
    networkRecording: config.enableSessionRecording
      ? {
          enabled: true,
          recordHeadersAndBody: false
        }
      : false,
    tracingOrigins
  }

  if (config.canvasSampling) {
    options.samplingStrategy = { canvas: config.canvasSampling }
  }

  return options
}

export const initHighlight = (config: HighlightConfig, options?: { apiBase?: string }) => {
  if (!config.enabled) return
  if (typeof window === 'undefined') return
  if (highlightInitialized) return

  const highlightOptions = buildHighlightOptions(config, options?.apiBase)
  H.init(config.projectId, highlightOptions)
  highlightInitialized = true
}

export const createClientErrorReporter = (config: HighlightConfig) => {
  return (error: unknown, metadata: ErrorMetadata = {}) => {
    if (!config.enabled) return

    const normalizedError = normalizeError(error)
    const normalizedMetadata = normalizeMetadata(metadata)

    H.consume(normalizedError, {
      message: normalizedError.message,
      payload: normalizedMetadata.payload,
      source: normalizedMetadata.source
    })
  }
}
