export const SERVER_HEALTH_INTERVAL_MS = 5000
export const SERVER_HEALTH_TIMEOUT_MS = 3000
export const SERVER_HEALTH_PERIODIC_SYNC_TAG = 'server-health'

export type ServerHealthSource = 'heartbeat' | 'periodic-sync' | 'online-event' | 'push' | string

export type ServerHealthResult = {
  online: boolean
  checkedAt: number
  key: string | null
  source: ServerHealthSource
}

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Pick<Response, 'ok'>>

const resolveServerHealthKey = (url: string) => {
  try {
    return new URL(url).host || null
  } catch {
    return null
  }
}

export const shouldProbeServerHealth = (
  lastCheckedAt: number | null | undefined,
  now = Date.now(),
  minIntervalMs = SERVER_HEALTH_INTERVAL_MS
) =>
  typeof lastCheckedAt !== 'number' ||
  !Number.isFinite(lastCheckedAt) ||
  now - lastCheckedAt >= minIntervalMs

export const probeServerHealth = async ({
  fetchImpl,
  url,
  source,
  timeoutMs = SERVER_HEALTH_TIMEOUT_MS,
  key = resolveServerHealthKey(url),
  now = () => Date.now(),
  headers
}: {
  fetchImpl: FetchLike
  url: string
  source: ServerHealthSource
  timeoutMs?: number
  key?: string | null
  now?: () => number
  headers?: HeadersInit
}): Promise<ServerHealthResult> => {
  const abortController =
    typeof AbortController === 'function' ? new AbortController() : null
  const timeoutHandle =
    abortController && timeoutMs > 0
      ? setTimeout(() => {
          abortController.abort()
        }, timeoutMs)
      : null
  const requestHeaders = new Headers(headers)
  requestHeaders.set('accept', 'application/json')

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: requestHeaders,
      signal: abortController?.signal
    })
    return {
      online: response.ok,
      checkedAt: now(),
      key,
      source
    }
  } catch {
    return {
      online: false,
      checkedAt: now(),
      key,
      source
    }
  } finally {
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle)
    }
  }
}
