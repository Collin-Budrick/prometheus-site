export const resolveIpFromHeaders = (headers: Headers, fallback: string) =>
  headers.get('cf-connecting-ip') ||
  headers.get('x-forwarded-for')?.split(',')[0].trim() ||
  headers.get('x-real-ip') ||
  headers.get('remote-addr') ||
  fallback

export const getClientIp = (request: Request) => resolveIpFromHeaders(request.headers, 'unknown')

export const resolveWsRequest = (ws: any): Request | undefined => {
  const candidate = ws?.data?.request ?? ws?.request
  return candidate instanceof Request ? candidate : undefined
}

export const resolveWsHeaders = (ws: any) => {
  const request = resolveWsRequest(ws)
  if (request) return request.headers
  const candidate = ws?.data?.headers ?? ws?.headers
  if (candidate instanceof Headers) return candidate
  if (candidate) return new Headers(candidate)
  return new Headers()
}

export const resolveWsClientIp = (ws: any) => resolveIpFromHeaders(resolveWsHeaders(ws), ws.remoteAddress ?? 'unknown')
