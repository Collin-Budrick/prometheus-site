import { describe, expect, it } from 'bun:test'

import {
  buildFragmentMeta,
  decodeFragmentPayload,
  encodeFragmentPayloadFromTree,
  encodeTree,
  transformFragmentPayload
} from './binary'
import type { FragmentDefinition, FragmentMeta, HeadOp, RenderNode } from './types'

const FRAGMENT_MAGIC = 0x46524147

const encoder = new TextEncoder()

const tree: RenderNode = {
  type: 'element',
  tag: 'section',
  attrs: { class: 'demo' },
  children: [{ type: 'text', text: 'hello' }]
}

const head: HeadOp[] = [{ op: 'meta', name: 'description', content: 'demo fragment' }]

const definition: FragmentDefinition = {
  id: 'fragment://binary-test',
  ttl: 10,
  staleTtl: 5,
  tags: ['test'],
  runtime: 'edge',
  head,
  css: '.demo { color: red; }',
  render: () => tree
}

const encodeV1Payload = (
  node: RenderNode,
  meta: FragmentMeta,
  ops: HeadOp[],
  css: string
) => {
  const treeBytes = encodeTree(node)
  const headBytes = ops.length ? encoder.encode(JSON.stringify(ops)) : new Uint8Array(0)
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

describe('fragment binary payload transforms', () => {
  it('drops css while preserving html in V3 payloads', () => {
    const payload = encodeFragmentPayloadFromTree(
      definition,
      tree,
      definition.id,
      '<section class="demo">hello</section>'
    )

    const transformed = transformFragmentPayload(payload, { includeCss: false, includeHtml: true })
    const decoded = decodeFragmentPayload(transformed)

    expect(decoded.css).toBe('')
    expect(decoded.html).toBe('<section class="demo">hello</section>')
    expect(decoded.head).toEqual(head)
    expect(decoded.tree).toEqual(tree)
  })

  it('drops html while preserving css in V3 payloads', () => {
    const payload = encodeFragmentPayloadFromTree(
      definition,
      tree,
      definition.id,
      '<section class="demo">hello</section>'
    )

    const transformed = transformFragmentPayload(payload, { includeCss: true, includeHtml: false })
    const decoded = decodeFragmentPayload(transformed)

    expect(decoded.css).toBe(definition.css)
    expect(decoded.html).toBeUndefined()
    expect(decoded.tree).toEqual(tree)
  })

  it('supports payloads with neither css nor html sections', () => {
    const payload = encodeFragmentPayloadFromTree(
      definition,
      tree,
      definition.id,
      '<section class="demo">hello</section>'
    )

    const transformed = transformFragmentPayload(payload, { includeCss: false, includeHtml: false })
    const decoded = decodeFragmentPayload(transformed)

    expect(decoded.css).toBe('')
    expect(decoded.html).toBeUndefined()
    expect(decoded.meta.cacheKey).toBe(definition.id)
  })

  it('remains backward compatible with V1 payloads', () => {
    const payload = encodeV1Payload(tree, buildFragmentMeta(definition), head, definition.css)
    const decoded = decodeFragmentPayload(payload)

    expect(decoded.meta.cacheKey).toBe(definition.id)
    expect(decoded.css).toBe(definition.css)
    expect(decoded.html).toBeUndefined()
    expect(decoded.tree).toEqual(tree)
  })
})
