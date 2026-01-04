const normalizeIpCandidate = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? undefined : trimmed
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isHeadersRecord = (value: unknown): value is Record<string, string> =>
  isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string')

const isHeaderTupleArray = (value: unknown): value is Array<[string, string]> =>
  Array.isArray(value) &&
  value.every(
    (entry) =>
      Array.isArray(entry) &&
      entry.length === 2 &&
      typeof entry[0] === 'string' &&
      typeof entry[1] === 'string'
  )

export const resolveIpFromHeaders = (headers: Headers, fallback: string) => {
  const forwardedFor = headers.get('x-forwarded-for')
  const candidates = [
    normalizeIpCandidate(headers.get('cf-connecting-ip')),
    normalizeIpCandidate(forwardedFor === null ? null : forwardedFor.split(',')[0]),
    normalizeIpCandidate(headers.get('x-real-ip')),
    normalizeIpCandidate(headers.get('remote-addr'))
  ]

  for (const candidate of candidates) {
    if (candidate !== undefined) return candidate
  }

  return fallback
}

export const getClientIp = (request: Request) => resolveIpFromHeaders(request.headers, 'unknown')

export const resolveWsRequest = (ws: unknown): Request | undefined => {
  if (!isRecord(ws)) return undefined
  const data = isRecord(ws.data) ? ws.data : undefined
  const candidate = data?.request ?? ws.request
  return candidate instanceof Request ? candidate : undefined
}

export const resolveWsHeaders = (ws: unknown) => {
  const request = resolveWsRequest(ws)
  if (request !== undefined) return request.headers
  if (!isRecord(ws)) return new Headers()
  const data = isRecord(ws.data) ? ws.data : undefined
  const candidate = data?.headers ?? ws.headers
  if (candidate instanceof Headers) return candidate
  if (isHeaderTupleArray(candidate) || isHeadersRecord(candidate)) return new Headers(candidate)
  return new Headers()
}

export const resolveWsClientIp = (ws: unknown) => {
  const fallback = isRecord(ws) && typeof ws.remoteAddress === 'string' ? ws.remoteAddress : 'unknown'
  return resolveIpFromHeaders(resolveWsHeaders(ws), fallback)
}
