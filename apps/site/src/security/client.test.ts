import { afterEach, describe, expect, it } from 'bun:test'
import {
  applyCspNonce,
  asTrustedHtml,
  asTrustedScript,
  asTrustedScriptUrl,
  getCspNonce,
  installTrustedTypesFunctionBridge,
  primeTrustedTypesPolicies,
  setTrustedInnerHtml,
  setTrustedTemplateHtml
} from './client'

type TrustedHtmlMock = {
  __html: string
  policy: string
}

const originalDocument = globalThis.document
const originalTrustedTypes = (globalThis as typeof globalThis & { trustedTypes?: unknown }).trustedTypes
const originalFunction = globalThis.Function
const originalTrustedTypePolicies = (globalThis as typeof globalThis & { __PROM_TT_POLICIES__?: unknown })
  .__PROM_TT_POLICIES__
const originalTrustedTypeFunctionBridge = (
  globalThis as typeof globalThis & {
    __PROM_TT_FUNCTION_BRIDGE__?: unknown
  }
).__PROM_TT_FUNCTION_BRIDGE__

const createTrustedTypesMock = () => ({
  createPolicy: (name: string) => ({
    createHTML: (input: string) =>
      ({
        __html: input,
        policy: name
      }) as never as TrustedHtmlMock,
    createScript: (input: string) =>
      ({
        __html: input,
        policy: name
      }) as never as TrustedHtmlMock,
    createScriptURL: (input: string) =>
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
  if (originalTrustedTypePolicies !== undefined) {
    ;(globalThis as typeof globalThis & { __PROM_TT_POLICIES__?: unknown }).__PROM_TT_POLICIES__ =
      originalTrustedTypePolicies
  } else {
    delete (globalThis as typeof globalThis & { __PROM_TT_POLICIES__?: unknown }).__PROM_TT_POLICIES__
  }
  globalThis.Function = originalFunction
  if (originalTrustedTypeFunctionBridge !== undefined) {
    ;(globalThis as typeof globalThis & { __PROM_TT_FUNCTION_BRIDGE__?: unknown }).__PROM_TT_FUNCTION_BRIDGE__ =
      originalTrustedTypeFunctionBridge
  } else {
    delete (globalThis as typeof globalThis & { __PROM_TT_FUNCTION_BRIDGE__?: unknown }).__PROM_TT_FUNCTION_BRIDGE__
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

  it('can prime both Trusted Types policies ahead of later runtime bundles', () => {
    ;(globalThis as typeof globalThis & { trustedTypes?: unknown }).trustedTypes = createTrustedTypesMock()

    const primed = primeTrustedTypesPolicies()
    const cachedPolicies = (
      globalThis as typeof globalThis & {
        __PROM_TT_POLICIES__?: Partial<Record<string, { createHTML: (input: string) => TrustedHtmlMock }>>
      }
    ).__PROM_TT_POLICIES__
    const serverTrusted = primed.server?.createHTML?.('<p>server</p>') as TrustedHtmlMock | undefined
    const templateTrusted = primed.template?.createHTML?.('<p>template</p>') as TrustedHtmlMock | undefined

    expect(serverTrusted?.policy).toBe('prometheus-server-html')
    expect(templateTrusted?.policy).toBe('prometheus-template-html')
    expect(Object.keys(cachedPolicies ?? {}).sort()).toEqual([
      'prometheus-server-html',
      'prometheus-template-html'
    ])
  })

  it('creates trusted scripts and bridges Function calls when Trusted Types require script objects', () => {
    ;(globalThis as typeof globalThis & { trustedTypes?: unknown }).trustedTypes = createTrustedTypesMock()

    const capturedArgs: unknown[][] = []
    const fakeFunction = function (...args: unknown[]) {
      capturedArgs.push(args)
      return originalFunction(...args.map((arg) => String((arg as { __html?: string })?.__html ?? arg)))
    } as unknown as FunctionConstructor

    globalThis.Function = fakeFunction

    const trustedScript = asTrustedScript('return 7') as TrustedHtmlMock
    expect(trustedScript.policy).toBe('prometheus-runtime-script')

    expect(installTrustedTypesFunctionBridge()).toBe(true)
    const generated = globalThis.Function('return 7') as () => number

    expect(capturedArgs).toHaveLength(1)
    expect((capturedArgs[0]?.[0] as TrustedHtmlMock).policy).toBe('prometheus-runtime-script')
    expect(generated()).toBe(7)
  })

  it('creates trusted script URLs for worker-style runtime entrypoints', () => {
    ;(globalThis as typeof globalThis & { trustedTypes?: unknown }).trustedTypes = createTrustedTypesMock()

    const trustedUrl = asTrustedScriptUrl('https://prometheus.prod/build/static-shell/shared-worker.js') as TrustedHtmlMock

    expect(trustedUrl.policy).toBe('prometheus-runtime-script')
    expect(trustedUrl.__html).toBe('https://prometheus.prod/build/static-shell/shared-worker.js')
  })
})
