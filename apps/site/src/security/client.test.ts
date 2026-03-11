import { afterEach, describe, expect, it } from 'bun:test'
import { applyCspNonce, asTrustedHtml, getCspNonce, setTrustedInnerHtml, setTrustedTemplateHtml } from './client'

type TrustedHtmlMock = {
  __html: string
  policy: string
}

const originalDocument = globalThis.document
const originalTrustedTypes = (globalThis as typeof globalThis & { trustedTypes?: unknown }).trustedTypes

const createTrustedTypesMock = () => ({
  createPolicy: (name: string) => ({
    createHTML: (input: string) =>
      ({
        __html: input,
        policy: name
      }) as never as TrustedHtmlMock
  })
})

afterEach(() => {
  globalThis.document = originalDocument
  if (originalTrustedTypes !== undefined) {
    ;(globalThis as typeof globalThis & { trustedTypes?: unknown }).trustedTypes = originalTrustedTypes
  } else {
    delete (globalThis as typeof globalThis & { trustedTypes?: unknown }).trustedTypes
  }
})

describe('security/client', () => {
  it('reads the nonce from the document root and applies it to runtime nodes', () => {
    globalThis.document = {
      documentElement: {
        getAttribute: (name: string) => (name === 'data-csp-nonce' ? 'nonce-from-root' : null)
      }
    } as never

    const script = { nonce: '' }
    const style = { nonce: '' }

    expect(getCspNonce()).toBe('nonce-from-root')
    expect(applyCspNonce(script).nonce).toBe('nonce-from-root')
    expect(applyCspNonce(style).nonce).toBe('nonce-from-root')
  })

  it('uses Trusted Types policies when the browser supports them', () => {
    ;(globalThis as typeof globalThis & { trustedTypes?: unknown }).trustedTypes = createTrustedTypesMock()

    const innerHtmlTarget = { innerHTML: '' as unknown }
    const template = { innerHTML: '' as unknown }
    const trustedHtml = asTrustedHtml('<p>safe</p>', 'server') as TrustedHtmlMock

    expect(trustedHtml.policy).toBe('prometheus-server-html')

    setTrustedInnerHtml(innerHtmlTarget as never, '<p>shell</p>', 'server')
    setTrustedTemplateHtml(template as never, '<div>dock</div>', 'template')

    expect((innerHtmlTarget.innerHTML as TrustedHtmlMock).policy).toBe('prometheus-server-html')
    expect((template.innerHTML as TrustedHtmlMock).policy).toBe('prometheus-template-html')
  })
})

