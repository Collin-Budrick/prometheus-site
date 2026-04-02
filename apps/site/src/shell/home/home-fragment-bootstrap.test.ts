import { afterEach, describe, expect, it } from 'bun:test'
import { gunzipSync, gzipSync } from 'node:zlib'
import {
  HOME_FRAGMENT_BOOTSTRAP_STATE_KEY,
  buildPrimeHomeFragmentBootstrapScript,
  buildHomeFragmentBootstrapEarlyHint,
  buildHomeFragmentBootstrapPreloadLink,
  fetchHomeFragmentBootstrapBytes
} from './home-fragment-bootstrap'

const mutableGlobals = globalThis as typeof globalThis & {
  DecompressionStream?: typeof DecompressionStream
}
const originalDecompressionStream = mutableGlobals.DecompressionStream

class MockGzipDecompressionStream {
  readonly readable: ReadableStream<Uint8Array>
  readonly writable: WritableStream<Uint8Array>

  constructor(format: string) {
    if (format !== 'gzip') {
      throw new Error(`Unsupported mock format: ${format}`)
    }

    const chunks: Uint8Array[] = []
    const transform = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk) {
        chunks.push(chunk)
      },
      flush(controller) {
        const input = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
        controller.enqueue(new Uint8Array(gunzipSync(input)))
      }
    })

    this.readable = transform.readable
    this.writable = transform.writable
  }
}

afterEach(() => {
  mutableGlobals.DecompressionStream = originalDecompressionStream
})

describe('home fragment bootstrap preload metadata', () => {
  it('marks the head preload as an anonymous fetch so the browser can reuse it', () => {
    expect(buildHomeFragmentBootstrapPreloadLink('en')).toMatchObject({
      rel: 'preload',
      as: 'fetch',
      crossorigin: 'anonymous'
    })
  })

  it('marks the early hint with matching crossorigin metadata', () => {
    expect(buildHomeFragmentBootstrapEarlyHint('en')).toMatchObject({
      as: 'fetch',
      crossorigin: 'anonymous'
    })
  })

  it('fetches the bootstrap bundle with matching cors and credentials settings', async () => {
    let requestInit: RequestInit | undefined

    await fetchHomeFragmentBootstrapBytes({
      href: 'https://prometheus.prod/api/fragments/bootstrap?protocol=2&ids=fragment://page/home/planner@v1',
      fetcher: async (_href, init) => {
        requestInit = init
        return new Response(new Uint8Array(0))
      }
    })

    expect(requestInit).toMatchObject({
      credentials: 'same-origin',
      mode: 'cors'
    })
  })

  it('advertises native compression and decompresses gzip bootstrap payloads when available', async () => {
    const payload = new Uint8Array([1, 2, 3, 4])
    let requestInit: RequestInit | undefined

    mutableGlobals.DecompressionStream = MockGzipDecompressionStream as unknown as typeof DecompressionStream

    const bytes = await fetchHomeFragmentBootstrapBytes({
      href: 'https://prometheus.prod/api/fragments/bootstrap?protocol=2&ids=fragment://page/home/planner@v1',
      fetcher: async (_href, init) => {
        requestInit = init
        return new Response(gzipSync(payload), {
          headers: {
            'x-fragment-content-encoding': 'gzip'
          }
        })
      }
    })

    expect(requestInit?.headers).toMatchObject({
      'x-fragment-accept-encoding': 'gzip'
    })
    expect(Array.from(bytes)).toEqual(Array.from(payload))
  })

  it('builds an inline priming script that stores the bootstrap promise on window', () => {
    const href = '/api/fragments/bootstrap?protocol=2&ids=fragment://page/home/planner@v1'
    const script = buildPrimeHomeFragmentBootstrapScript(href)

    expect(script).toContain(HOME_FRAGMENT_BOOTSTRAP_STATE_KEY)
    expect(script).toContain('x-fragment-accept-encoding')
    expect(script).toContain('DecompressionStream')
    expect(script).toContain('fetch(href,{cache:"default",credentials:"same-origin",mode:"cors",headers:headers})')
    expect(script).toContain(JSON.stringify(href))
  })
})
