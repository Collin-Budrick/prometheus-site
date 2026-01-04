import { afterEach, describe, expect, it } from 'bun:test'

import { loadFragmentPlan, loadFragments } from './server'
import type { FragmentMeta, HeadOp, RenderNode } from './types'

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

const encodeFragmentPayload = (
  tree: RenderNode,
  meta: FragmentMeta,
  head: HeadOp[] = [],
  css = ''
) => {
  const treeBytes = encodeTree(tree)
  const headBytes = head.length ? encoder.encode(JSON.stringify(head)) : new Uint8Array(0)
  const cssBytes = css ? encoder.encode(css) : new Uint8Array(0)
  const metaBytes = encoder.encode(JSON.stringify(meta))

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
  new Uint8Array(buffer, cursor, headBytes.length).set(headBytes)
  cursor += headBytes.length
  new Uint8Array(buffer, cursor, cssBytes.length).set(cssBytes)
  cursor += cssBytes.length
  new Uint8Array(buffer, cursor, metaBytes.length).set(metaBytes)

  return new Uint8Array(buffer)
}

const buildMeta = (cacheKey: string): FragmentMeta => ({
  cacheKey,
  ttl: 10,
  staleTtl: 5,
  tags: ['test'],
  runtime: 'edge'
})

const tree: RenderNode = {
  type: 'element',
  tag: 'section',
  children: [{ type: 'text', text: 'hello' }]
}

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('SSR fragment cache metadata', () => {
  it('attaches cacheUpdatedAt to initial fragments from plan metadata', async () => {
    const id = 'fragment://plan-cache'
    const bytes = encodeFragmentPayload(tree, buildMeta(id))
    const updatedAt = 1711

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          path: '/plan-cache',
          createdAt: 1,
          fragments: [
            {
              id,
              critical: true,
              layout: { column: 'span 12' },
              cache: {
                status: 'hit',
                updatedAt,
                staleAt: updatedAt + 1,
                expiresAt: updatedAt + 2
              }
            }
          ],
          initialFragments: {
            [id]: Buffer.from(bytes).toString('base64')
          }
        }),
        { headers: { 'content-type': 'application/json' } }
      )) as typeof fetch

    const result = await loadFragmentPlan('/plan-cache', { VITE_API_BASE: 'http://api.test' }, 'en')
    expect(result.initialFragments?.[id]?.cacheUpdatedAt).toBe(updatedAt)
  })

  it('uses fragment cache headers when fetching SSR fragments', async () => {
    const id = 'fragment://header-cache'
    const bytes = encodeFragmentPayload(tree, buildMeta(id))
    const updatedAt = 2424

    globalThis.fetch = (async () =>
      new Response(bytes, {
        headers: { 'x-fragment-cache-updated': String(updatedAt) }
      })) as typeof fetch

    const result = await loadFragments([id], { VITE_API_BASE: 'http://api.test' }, 'en')
    expect(result[id]?.cacheUpdatedAt).toBe(updatedAt)
  })
})
