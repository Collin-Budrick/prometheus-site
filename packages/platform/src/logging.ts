import type { ClientErrorReportingConfig } from './env'

type ErrorMetadata = Record<string, unknown>

const normalizeError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    }
  }

  return {
    name: 'UnknownError',
    message: typeof error === 'string' ? error : 'Unknown client error',
    stack: undefined
  }
}

const sendBeacon = (endpoint: string, payload: string) => {
  if (typeof navigator === 'undefined') return false

  const body = new Blob([payload], { type: 'application/json' })
  return navigator.sendBeacon?.(endpoint, body) ?? false
}

const postWithFetch = (endpoint: string, payload: string) => {
  if (typeof fetch === 'undefined') return

  const body = new Blob([payload], { type: 'application/json' })
  void fetch(endpoint, {
    method: 'POST',
    body,
    keepalive: true,
    headers: { 'content-type': 'application/json' }
  })
}

export const createClientErrorReporter = (config: ClientErrorReportingConfig) => {
  const endpoint = config.beaconUrl?.trim() ?? ''
  const enabled = config.enabled && endpoint.length > 0

  return (error: unknown, metadata: ErrorMetadata = {}) => {
    if (!enabled) return

    const payload = JSON.stringify({
      ...normalizeError(error),
      metadata,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      timestamp: Date.now()
    })

    const sent = sendBeacon(endpoint, payload)
    if (!sent) {
      postWithFetch(endpoint, payload)
    }
  }
}
