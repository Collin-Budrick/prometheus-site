export const isHtmlPreviewResponse = (contentType, body) => {
  const normalizedBody = Buffer.isBuffer(body) ? body : Buffer.from(body ?? '')
  const normalizedContentType = String(contentType || '')
  return (
    normalizedContentType.includes('text/html') ||
    normalizedBody.toString('utf8', 0, Math.min(normalizedBody.length, 64)).includes('<!DOCTYPE html')
  )
}

export const preparePreviewResponseBody = ({
  body,
  contentType,
  headersSent,
  injectHtml
}) => {
  const normalizedBody = Buffer.isBuffer(body) ? body : Buffer.from(body ?? '')
  const shouldInject = isHtmlPreviewResponse(contentType, normalizedBody)

  if (!shouldInject || headersSent) {
    return {
      body: normalizedBody,
      contentLength: null,
      encoding: undefined,
      injected: false
    }
  }

  const html = injectHtml(normalizedBody.toString('utf8'))
  return {
    body: html,
    contentLength: Buffer.byteLength(html),
    encoding: 'utf8',
    injected: true
  }
}
