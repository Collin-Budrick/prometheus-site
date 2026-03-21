import { afterEach, describe, expect, it } from 'bun:test'
import { buildFragmentFrame } from '@core/fragment/frames'
import {
  type HomeFragmentBootstrapWindow,
  buildHomeFragmentBootstrapHref,
  primeHomeFragmentBootstrapBytes,
  resetHomeFragmentBootstrapStateForTests
} from './home-fragment-bootstrap'
import { fetchHomeFragmentBatch, resetHomeFragmentBatchCacheForTests } from './home-fragment-client'

const FRAGMENT_MAGIC = 0x46524147
const TREE_MAGIC = 0x54524545
const TREE_NODE_SIZE = 24
const ATTR_SIZE = 8

const encoder = new TextEncoder()
const originalFetch = globalThis.fetch
const originalWindow = (globalThis as typeof globalThis & { window?: HomeFragmentBootstrapWindow }).window

type NodeRecord = {
  type: number
  tagId: number
  textId: number
  firstChild: number
  nextSibling: number
  attrStart: number
  attrCount: number
}

const tree = {
  type: 'element',
  tag: 'section',
  children: [{ type: 'text', text: 'hello' }]
} as const

const encodeTree = (root: typeof tree): Uint8Array => {
  const strings: string[] = []
  const stringIndex = new Map<string, number>()
  const nodes: NodeRecord[] = []
  const attrs: Array<[number, number]> = []

  const getStringId = (value: string) => {
    const existing = stringIndex.get(value)
    if (existing !== undefined) return existing
    const id = strings.length
    strings.push(value)
    stringIndex.set(value, id)
    return id
  }

  const addNode = (node: typeof tree | { type: 'text'; text: string }): number => {
    const index = nodes.length
    const record: NodeRecord = {
      type: node.type === 'text' ? 1 : 0,
      tagId: 0,
      textId: 0,
      firstChild: 0xffffffff,
      nextSibling: 0xffffffff,
      attrStart: attrs.length,
      attrCount: 0
    }
    nodes.push(record)

    if (node.type === 'text') {
      record.textId = getStringId(node.text ?? '')
      return index
    }

    record.tagId = getStringId(node.tag ?? 'div')

    let prevChild = 0xffffffff
    const children = node.children ?? []
    children.forEach((child) => {
      const childIndex = addNode(child as typeof tree | { type: 'text'; text: string })
      if (record.firstChild === 0xffffffff) {
        record.firstChild = childIndex
      }
      if (prevChild !== 0xffffffff) {
        nodes[prevChild].nextSibling = childIndex
      }
      prevChild = childIndex
    })

    return index
  }

  addNode(root)

  const stringBytes = strings.map((value) => encoder.encode(value))
  const stringBytesLength = stringBytes.reduce((sum, bytes) => sum + 4 + bytes.length, 0)
  const headerSize = 24
  const nodesSize = nodes.length * TREE_NODE_SIZE
  const attrsSize = attrs.length * ATTR_SIZE
  const totalSize = headerSize + nodesSize + attrsSize + stringBytesLength
  const buffer = new ArrayBuffer(totalSize)
  const view = new DataView(buffer)

  view.setUint32(0, TREE_MAGIC, false)
  view.setUint8(4, 1)
  view.setUint32(8, nodes.length, true)
  view.setUint32(12, attrs.length, true)
  view.setUint32(16, strings.length, true)
  view.setUint32(20, stringBytesLength, true)

  let cursor = headerSize
  nodes.forEach((node) => {
    view.setUint8(cursor, node.type)
    view.setUint16(cursor + 2, node.attrCount, true)
    view.setUint32(cursor + 4, node.tagId, true)
    view.setUint32(cursor + 8, node.textId, true)
    view.setUint32(cursor + 12, node.firstChild, true)
    view.setUint32(cursor + 16, node.nextSibling, true)
    view.setUint32(cursor + 20, node.attrStart, true)
    cursor += TREE_NODE_SIZE
  })

  attrs.forEach(([nameId, valueId]) => {
    view.setUint32(cursor, nameId, true)
    view.setUint32(cursor + 4, valueId, true)
    cursor += ATTR_SIZE
  })

  stringBytes.forEach((bytes) => {
    view.setUint32(cursor, bytes.length, true)
    cursor += 4
    new Uint8Array(buffer, cursor, bytes.length).set(bytes)
    cursor += bytes.length
  })

  return new Uint8Array(buffer)
}

const encodeFragmentPayload = (cacheKey: string) => {
  const treeBytes = encodeTree(tree)
  const headBytes = new Uint8Array(0)
  const cssBytes = new Uint8Array(0)
  const metaBytes = encoder.encode(
    JSON.stringify({
      cacheKey,
      ttl: 30,
      staleTtl: 120,
      tags: ['test'],
      runtime: 'edge'
    })
  )

  const headerSize = 24
  const total = headerSize + treeBytes.length + headBytes.length + cssBytes.length + metaBytes.length
  const buffer = new ArrayBuffer(total)
  const view = new DataView(buffer)

  view.setUint32(0, FRAGMENT_MAGIC, false)
  view.setUint8(4, 1)
  view.setUint32(8, treeBytes.length, true)
  view.setUint32(12, headBytes.length, true)
  view.setUint32(16, cssBytes.length, true)
  view.setUint32(20, metaBytes.length, true)

  let cursor = headerSize
  new Uint8Array(buffer, cursor, treeBytes.length).set(treeBytes)
  cursor += treeBytes.length
  new Uint8Array(buffer, cursor, metaBytes.length).set(metaBytes)

  return new Uint8Array(buffer)
}

const buildBootstrapPayload = (...ids: string[]) =>
  new Uint8Array(ids.flatMap((id) => Array.from(buildFragmentFrame(id, encodeFragmentPayload(id)))))

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalWindow) {
    ;(globalThis as typeof globalThis & { window?: HomeFragmentBootstrapWindow }).window = originalWindow
  } else {
    delete (globalThis as typeof globalThis & { window?: HomeFragmentBootstrapWindow }).window
  }
  resetHomeFragmentBatchCacheForTests()
  resetHomeFragmentBootstrapStateForTests()
})

describe('fetchHomeFragmentBatch', () => {
  it('keeps the default home bootstrap bundle scoped to below-the-fold cards', () => {
    const href = buildHomeFragmentBootstrapHref({ lang: 'en' })

    expect(href).toContain('fragment%3A%2F%2Fpage%2Fhome%2Fplanner%40v1')
    expect(href).toContain('fragment%3A%2F%2Fpage%2Fhome%2Fledger%40v1')
    expect(href).toContain('fragment%3A%2F%2Fpage%2Fhome%2Fisland%40v1')
    expect(href).toContain('fragment%3A%2F%2Fpage%2Fhome%2Freact%40v1')
    expect(href).not.toContain('fragment%3A%2F%2Fpage%2Fhome%2Fdock%40v2')
  })

  it('uses the stable bootstrap GET bundle for home fragment refreshes', async () => {
    const href = buildHomeFragmentBootstrapHref({
      lang: 'en',
      ids: ['fragment://page/home/planner@v1']
    })
    const requests: Array<{ url: string; method: string | undefined }> = []

    globalThis.fetch = (async (input, init) => {
      const url = typeof input === 'string' ? input : input.url
      requests.push({ url, method: init?.method })
      return new Response(
        buildBootstrapPayload('fragment://page/home/planner@v1', 'fragment://page/home/react@v1'),
        {
          headers: { 'content-type': 'application/octet-stream' }
        }
      )
    }) as typeof fetch

    const payloads = await fetchHomeFragmentBatch(['fragment://page/home/planner@v1'], { lang: 'en' })

    expect(requests).toEqual([{ url: href, method: undefined }])
    expect(Object.keys(payloads)).toEqual(['fragment://page/home/planner@v1'])
  })

  it('keeps using the bootstrap GET bundle when known fragment versions are provided', async () => {
    const href = buildHomeFragmentBootstrapHref({
      lang: 'en',
      ids: ['fragment://page/home/planner@v1']
    })
    const requests: Array<{ url: string; method: string | undefined }> = []

    globalThis.fetch = (async (input, init) => {
      const url = typeof input === 'string' ? input : input.url
      requests.push({ url, method: init?.method })
      return new Response(
        buildBootstrapPayload('fragment://page/home/planner@v1', 'fragment://page/home/react@v1'),
        {
          headers: { 'content-type': 'application/octet-stream' }
        }
      )
    }) as typeof fetch

    const payloads = await fetchHomeFragmentBatch(['fragment://page/home/planner@v1'], {
      lang: 'en',
      knownVersions: {
        'fragment://page/home/planner@v1': 1773319098713,
        'fragment://page/home/react@v1': 1773319098718
      }
    })

    expect(requests).toEqual([{ url: href, method: undefined }])
    expect(Object.keys(payloads)).toEqual(['fragment://page/home/planner@v1'])
  })

  it('reuses a primed bootstrap bundle instead of issuing a fallback fragment request', async () => {
    const href = buildHomeFragmentBootstrapHref({
      lang: 'en',
      ids: ['fragment://page/home/planner@v1']
    })
    const win = {} as HomeFragmentBootstrapWindow
    ;(globalThis as typeof globalThis & { window?: HomeFragmentBootstrapWindow }).window = win

    let requestCount = 0
    await primeHomeFragmentBootstrapBytes({
      href,
      win,
      fetcher: async () => {
        requestCount += 1
        return new Response(
          buildBootstrapPayload('fragment://page/home/planner@v1', 'fragment://page/home/react@v1'),
          {
            headers: { 'content-type': 'application/octet-stream' }
          }
        )
      }
    })

    globalThis.fetch = (async () => {
      throw new Error('Unexpected fallback fragment fetch')
    }) as typeof fetch

    const plannerPayloads = await fetchHomeFragmentBatch(['fragment://page/home/planner@v1'], {
      lang: 'en',
      bootstrapHref: href
    })

    expect(requestCount).toBe(1)
    expect(Object.keys(plannerPayloads)).toEqual(['fragment://page/home/planner@v1'])
  })

  it('keeps the primed bootstrap bundle available for repeated subset hydrations of the same selection', async () => {
    const href = buildHomeFragmentBootstrapHref({
      lang: 'en',
      ids: ['fragment://page/home/planner@v1']
    })
    const win = {} as HomeFragmentBootstrapWindow
    ;(globalThis as typeof globalThis & { window?: HomeFragmentBootstrapWindow }).window = win

    let requestCount = 0
    await primeHomeFragmentBootstrapBytes({
      href,
      win,
      fetcher: async () => {
        requestCount += 1
        return new Response(buildBootstrapPayload('fragment://page/home/planner@v1'), {
          headers: { 'content-type': 'application/octet-stream' }
        })
      }
    })

    globalThis.fetch = (async () => {
      throw new Error('Unexpected fallback fragment fetch')
    }) as typeof fetch

    const plannerPayloads = await fetchHomeFragmentBatch(['fragment://page/home/planner@v1'], {
      lang: 'en',
      bootstrapHref: href
    })
    const repeatedPlannerPayloads = await fetchHomeFragmentBatch(['fragment://page/home/planner@v1'], {
      lang: 'en',
      bootstrapHref: href
    })

    expect(requestCount).toBe(1)
    expect(Object.keys(plannerPayloads)).toEqual(['fragment://page/home/planner@v1'])
    expect(Object.keys(repeatedPlannerPayloads)).toEqual(['fragment://page/home/planner@v1'])
  })

  it('reuses a primed full bootstrap bundle for subset home fragment selections', async () => {
    const fullHref = buildHomeFragmentBootstrapHref({
      lang: 'en',
      ids: ['fragment://page/home/planner@v1', 'fragment://page/home/react@v1']
    })
    const win = {} as HomeFragmentBootstrapWindow
    ;(globalThis as typeof globalThis & { window?: HomeFragmentBootstrapWindow }).window = win

    let requestCount = 0
    await primeHomeFragmentBootstrapBytes({
      href: fullHref,
      win,
      fetcher: async () => {
        requestCount += 1
        return new Response(
          buildBootstrapPayload('fragment://page/home/planner@v1', 'fragment://page/home/react@v1'),
          {
            headers: { 'content-type': 'application/octet-stream' }
          }
        )
      }
    })

    globalThis.fetch = (async () => {
      throw new Error('Unexpected subset bootstrap fetch')
    }) as typeof fetch

    const plannerPayloads = await fetchHomeFragmentBatch(['fragment://page/home/planner@v1'], {
      lang: 'en',
      bootstrapHref: fullHref
    })

    expect(requestCount).toBe(1)
    expect(Object.keys(plannerPayloads)).toEqual(['fragment://page/home/planner@v1'])
  })
})
