export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const concatUint8 = (chunks: Uint8Array[]) => {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

export const applyRateLimitHeaders = (set: { headers?: unknown }, headers: Headers) => {
  let resolved: Headers
  try {
    resolved = new Headers(set.headers as HeadersInit | undefined)
  } catch {
    resolved = new Headers()
  }
  headers.forEach((value, key) => {
    resolved.set(key, value)
  })
  set.headers = resolved
}

export const attachRateLimitHeaders = (response: Response, headers: Headers) => {
  headers.forEach((value, key) => {
    response.headers.set(key, value)
  })
  return response
}
