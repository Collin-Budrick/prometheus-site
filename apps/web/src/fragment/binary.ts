import type { FragmentMeta, FragmentPayload, HeadOp, RenderNode } from './types'

const FRAGMENT_MAGIC = 0x46524147
const TREE_MAGIC = 0x54524545
const TREE_NODE_SIZE = 24
const ATTR_SIZE = 8

const decoder = new TextDecoder()

const readMagic = (view: DataView, offset: number) => view.getUint32(offset, false)

const decodeStrings = (view: DataView, offset: number, count: number) => {
  const strings: string[] = []
  let cursor = offset
  for (let i = 0; i < count; i += 1) {
    const length = view.getUint32(cursor, true)
    cursor += 4
    const bytes = new Uint8Array(view.buffer, view.byteOffset + cursor, length)
    strings.push(decoder.decode(bytes))
    cursor += length
  }
  return { strings, bytesRead: cursor - offset }
}

const decodeTree = (bytes: Uint8Array): RenderNode => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (readMagic(view, 0) !== TREE_MAGIC) {
    throw new Error('Invalid tree magic')
  }
  const nodeCount = view.getUint32(8, true)
  const attrCount = view.getUint32(12, true)
  const stringCount = view.getUint32(16, true)
  const stringBytesLength = view.getUint32(20, true)

  const nodesOffset = 24
  const attrsOffset = nodesOffset + nodeCount * TREE_NODE_SIZE
  const stringsOffset = attrsOffset + attrCount * ATTR_SIZE

  const attrPairs: Array<[number, number]> = []
  for (let i = 0; i < attrCount; i += 1) {
    const base = attrsOffset + i * ATTR_SIZE
    const nameId = view.getUint32(base, true)
    const valueId = view.getUint32(base + 4, true)
    attrPairs.push([nameId, valueId])
  }

  const { strings } = decodeStrings(view, stringsOffset, stringCount)

  const readNode = (index: number): RenderNode => {
    const base = nodesOffset + index * TREE_NODE_SIZE
    const type = view.getUint8(base)
    const attrCountLocal = view.getUint16(base + 2, true)
    const tagId = view.getUint32(base + 4, true)
    const textId = view.getUint32(base + 8, true)
    const firstChild = view.getUint32(base + 12, true)
    const nextSibling = view.getUint32(base + 16, true)
    const attrStart = view.getUint32(base + 20, true)

    if (type === 1) {
      return { type: 'text', text: strings[textId] ?? '' }
    }

    const attrs: Record<string, string> = {}
    for (let i = 0; i < attrCountLocal; i += 1) {
      const [nameId, valueId] = attrPairs[attrStart + i] ?? []
      if (nameId === undefined) continue
      attrs[strings[nameId]] = strings[valueId] ?? ''
    }

    const children: RenderNode[] = []
    let childIndex = firstChild
    while (childIndex !== 0xffffffff) {
      children.push(readNode(childIndex))
      const childBase = nodesOffset + childIndex * TREE_NODE_SIZE
      childIndex = view.getUint32(childBase + 16, true)
    }

    return {
      type: 'element',
      tag: strings[tagId] ?? 'div',
      attrs: Object.keys(attrs).length ? attrs : undefined,
      children: children.length ? children : undefined
    }
  }

  return readNode(0)
}

const decodeJson = <T>(bytes: Uint8Array, fallback: T): T => {
  if (!bytes.length) return fallback
  try {
    const raw = decoder.decode(bytes)
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export const decodeFragmentPayload = (bytes: Uint8Array): FragmentPayload => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (readMagic(view, 0) !== FRAGMENT_MAGIC) {
    throw new Error('Invalid fragment magic')
  }
  const treeLength = view.getUint32(8, true)
  const headLength = view.getUint32(12, true)
  const cssLength = view.getUint32(16, true)
  const metaLength = view.getUint32(20, true)

  let cursor = 24
  const treeBytes = bytes.slice(cursor, cursor + treeLength)
  cursor += treeLength
  const headBytes = bytes.slice(cursor, cursor + headLength)
  cursor += headLength
  const cssBytes = bytes.slice(cursor, cursor + cssLength)
  cursor += cssLength
  const metaBytes = bytes.slice(cursor, cursor + metaLength)

  const head = decodeJson<HeadOp[]>(headBytes, [])
  const css = cssBytes.length ? decoder.decode(cssBytes) : ''
  const meta = decodeJson<FragmentMeta>(metaBytes, {
    cacheKey: '',
    ttl: 0,
    staleTtl: 0,
    tags: [],
    runtime: 'edge'
  })

  const tree = decodeTree(treeBytes)

  return {
    id: meta.cacheKey,
    tree,
    head,
    css,
    meta
  }
}
