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

export const reportClientError = (endpoint: string, error: unknown, metadata: ErrorMetadata = {}) => {
  if (!endpoint || typeof navigator === 'undefined') return

  const payload = JSON.stringify({
    ...normalizeError(error),
    metadata,
    userAgent: navigator.userAgent,
    timestamp: Date.now()
  })
  const body = new Blob([payload], { type: 'application/json' })
  const sent = navigator.sendBeacon?.(endpoint, body)

  if (!sent) {
    fetch(endpoint, {
      method: 'POST',
      body,
      keepalive: true,
      headers: { 'content-type': 'application/json' }
    }).catch(() => {})
  }
}
