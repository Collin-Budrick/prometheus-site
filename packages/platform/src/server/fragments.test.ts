import { describe, expect, it } from 'bun:test'
import { parseFragmentFrames } from '@core/fragment/frames'
import type { RenderNode } from '@core/fragments'
import type { FragmentStore, StoredFragment } from '@core/fragment/store'
import { createFragmentRoutes, type FragmentRouteOptions } from './fragments'

const FRAGMENT_MAGIC = 0x46524147
const TREE_MAGIC = 0x54524545
const TREE_NODE_SIZE = 24
const ATTR_SIZE = 8

const encoder = new TextEncoder()

type NodeRecord = {
  type: number
  tagId: number
  textId: number
  firstChild: number
  nextSibling: number
  attrStart: number
  attrCount: number
}

const tree: RenderNode = {
  type: 'element',
  tag: 'section',
  children: [{ type: 'text', text: 'hello' }]
}

const encodeTree = (root: RenderNode): Uint8Array => {
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

  const addNode = (node: RenderNode): number => {
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

    const attrEntries = node.attrs ? Object.entries(node.attrs) : []
    attrEntries.forEach(([name, value]) => {
      attrs.push([getStringId(name), getStringId(value)])
    })
    record.attrCount = attrEntries.length

    let prevChild = 0xffffffff
    const children = node.children ?? []
    children.forEach((child) => {
      const childIndex = addNode(child)
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

const createStoredFragment = (id: string): StoredFragment => ({
  payload: encodeFragmentPayload(id),
  html: `<section>${id}</section>`,
  updatedAt: 1,
  meta: {
    cacheKey: id,
    ttl: 30,
    staleTtl: 120,
    tags: ['test'],
    runtime: 'edge'
  }
})

const createRouteApp = () => {
  const fragments = new Map(
    [
      'fragment://page/home/planner@v1',
      'fragment://page/home/react@v1',
      'fragment://page/home/dock@v2'
    ].map((id) => [id, createStoredFragment(id)])
  )

  const plan = {
    path: '/',
    createdAt: 1,
    fragments: [
      {
        id: 'fragment://page/home/planner@v1',
        critical: false,
        layout: { column: 'span 5' }
      },
      {
        id: 'fragment://page/home/react@v1',
        critical: false,
        layout: { column: 'span 12' }
      },
      {
        id: 'fragment://page/home/dock@v2',
        critical: false,
        layout: { column: 'span 12' }
      }
    ],
    fetchGroups: [[
      'fragment://page/home/planner@v1',
      'fragment://page/home/react@v1',
      'fragment://page/home/dock@v2'
    ]]
  }

  const options: FragmentRouteOptions = {
    cache: {
      isReady: () => false,
      client: {} as never
    } as never,
    service: {
      clearPlanMemo: () => undefined,
      getFragmentEntry: async (id: string) => {
        const entry = fragments.get(id)
        if (!entry) {
          throw new Error(`Unknown fragment: ${id}`)
        }
        return entry
      },
      getFragmentPlan: async () => plan,
      getMemoizedPlan: () => null,
      memoizeFragmentPlan: () => undefined,
      streamFragmentsForPath: async () => new ReadableStream<Uint8Array>()
    } as never,
    store: {} as FragmentStore,
    updates: {
      subscribe: () => () => undefined
    } as never,
    enableWebTransportFragments: false,
    environment: 'test'
  }

  return createFragmentRoutes(options)
}

describe('createFragmentRoutes bootstrap ids', () => {
  it('returns only the requested protocol 2 fragment ids with stable ordering', async () => {
    const app = createRouteApp()

    const response = await app.handle(
      new Request(
        'http://site.test/fragments/bootstrap?path=/&protocol=2&ids=' +
          encodeURIComponent(
            'fragment://page/home/react@v1,fragment://page/home/planner@v1,fragment://page/home/react@v1'
          )
      )
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/octet-stream')

    const frames = parseFragmentFrames(new Uint8Array(await response.arrayBuffer()))
    expect(frames.map((frame) => frame.id)).toEqual([
      'fragment://page/home/react@v1',
      'fragment://page/home/planner@v1'
    ])
  })
})
