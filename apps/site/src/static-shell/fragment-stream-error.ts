const isRetryableHttpStatus = (status: number) => status === 408 || status === 425 || status === 429 || status >= 500

export class FragmentStreamError extends Error {
  readonly status: number | null
  readonly retryable: boolean

  constructor(message: string, options: { status?: number | null; retryable?: boolean } = {}) {
    super(message)
    this.name = 'FragmentStreamError'
    this.status = typeof options.status === 'number' ? options.status : null
    this.retryable =
      typeof options.retryable === 'boolean'
        ? options.retryable
        : this.status === null
          ? true
          : isRetryableHttpStatus(this.status)
  }
}

export const shouldRetryFragmentStream = (error: unknown) => {
  if (error instanceof FragmentStreamError) {
    return error.retryable
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return false
  }
  if (error && typeof error === 'object') {
    const status = Reflect.get(error, 'status')
    const retryable = Reflect.get(error, 'retryable')
    if (typeof retryable === 'boolean') {
      return retryable
    }
    if (typeof status === 'number') {
      return isRetryableHttpStatus(status)
    }
  }
  return true
}
