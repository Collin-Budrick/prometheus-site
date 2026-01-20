import type { HighlightOptions } from 'highlight.run'
import type { HighlightConfig } from './env'

type ErrorMetadata = Record<string, unknown>
type HighlightModule = typeof import('highlight.run')
declare const __HIGHLIGHT_BUILD_ENABLED__: boolean | undefined
const HIGHLIGHT_BUILD_ENABLED =
  typeof __HIGHLIGHT_BUILD_ENABLED__ === 'boolean' ? __HIGHLIGHT_BUILD_ENABLED__ : false
const highlightImporter = HIGHLIGHT_BUILD_ENABLED ? () => import('highlight.run') : null
let highlightInitialized = false
let highlightDecision: boolean | null = null
let highlightModulePromise: Promise<HighlightModule> | null = null
let highlightInitPromise: Promise<void> | null = null
let highlightInitOptions: { apiBase?: string } | null = null

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
  const normalizedApiBase = typeof apiBase === 'string' ? apiBase.trim() : ''
  const tracingOrigins = normalizedApiBase !== '' ? [normalizedApiBase] : true
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

  if (config.canvasSampling !== undefined) {
    options.samplingStrategy = { canvas: config.canvasSampling }
  }

  return options
}

const loadHighlight = () => {
  if (!highlightImporter) {
    return Promise.reject(new Error('Highlight disabled at build time.'))
  }
  if (!highlightModulePromise) {
    highlightModulePromise = highlightImporter()
  }
  return highlightModulePromise
}

const resolveSampleRate = (value: number) => {
  if (!Number.isFinite(value)) return 0
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

const shouldEnableHighlight = (config: HighlightConfig) => {
  if (!HIGHLIGHT_BUILD_ENABLED) return false
  if (!config.enabled) return false
  if (typeof window === 'undefined') return false
  if (highlightDecision !== null) return highlightDecision
  const sampleRate = resolveSampleRate(config.sampleRate)
  if (sampleRate <= 0) {
    highlightDecision = false
    return false
  }
  if (sampleRate >= 1) {
    highlightDecision = true
    return true
  }
  highlightDecision = Math.random() < sampleRate
  return highlightDecision
}

const ensureHighlightInitialized = (config: HighlightConfig, options?: { apiBase?: string }) => {
  if (highlightInitialized) return Promise.resolve()
  if (highlightInitPromise) return highlightInitPromise
  if (options) {
    highlightInitOptions = options
  }
  const initOptions = highlightInitOptions ?? options
  highlightInitPromise = loadHighlight()
    .then((mod) => {
      if (highlightInitialized) return
      const highlightOptions = buildHighlightOptions(config, initOptions?.apiBase)
      mod.H.init(config.projectId, highlightOptions)
      highlightInitialized = true
    })
    .catch(() => {
      highlightInitPromise = null
    })
  return highlightInitPromise
}

export const initHighlight = (config: HighlightConfig, options?: { apiBase?: string }) => {
  if (!shouldEnableHighlight(config)) return
  if (typeof window === 'undefined') return
  void ensureHighlightInitialized(config, options)
}

export const createClientErrorReporter = (config: HighlightConfig) => {
  return (error: unknown, metadata: ErrorMetadata = {}) => {
    if (!shouldEnableHighlight(config)) return

    const normalizedError = normalizeError(error)
    const normalizedMetadata = normalizeMetadata(metadata)

    void ensureHighlightInitialized(config).then(() => {
      if (!highlightInitialized) return
      return loadHighlight().then((mod) => {
        mod.H.consume(normalizedError, {
          message: normalizedError.message,
          payload: normalizedMetadata.payload,
          source: normalizedMetadata.source
        })
      })
    })
  }
}
