import { describe, expect, it } from 'bun:test'
import { isHtmlPreviewResponse, preparePreviewResponseBody } from './serve-preview-response.mjs'

describe('serve-preview-response', () => {
  it('injects html responses while headers are still mutable', () => {
    const response = preparePreviewResponseBody({
      body: Buffer.from('<!DOCTYPE html><html><head></head><body>preview</body></html>'),
      contentType: 'text/html; charset=utf-8',
      headersSent: false,
      injectHtml: (html: string) => html.replace('</head>', '<style>vt</style></head>')
    })

    expect(response.injected).toBe(true)
    expect(response.encoding).toBe('utf8')
    expect(response.contentLength).toBeGreaterThan(0)
    expect(String(response.body)).toContain('<style>vt</style>')
  })

  it('passes non-html responses through unchanged', () => {
    const body = Buffer.from('plain text response')
    const response = preparePreviewResponseBody({
      body,
      contentType: 'text/plain; charset=utf-8',
      headersSent: false,
      injectHtml: () => {
        throw new Error('non-html responses should not be injected')
      }
    })

    expect(response.injected).toBe(false)
    expect(response.contentLength).toBeNull()
    expect(response.body).toBe(body)
  })

  it('skips injection after headers are sent', () => {
    const body = Buffer.from('<!DOCTYPE html><html><head></head><body>preview</body></html>')
    const response = preparePreviewResponseBody({
      body,
      contentType: 'text/html; charset=utf-8',
      headersSent: true,
      injectHtml: () => {
        throw new Error('headers-sent responses should not be reinjected')
      }
    })

    expect(response.injected).toBe(false)
    expect(response.contentLength).toBeNull()
    expect(response.body).toBe(body)
  })

  it('treats doctype bodies as html even without a content type header', () => {
    expect(
      isHtmlPreviewResponse(
        undefined,
        Buffer.from('<!DOCTYPE html><html><head></head><body>preview</body></html>')
      )
    ).toBe(true)
  })
})
