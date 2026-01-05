import type { FragmentMeta, FragmentDefinition, FragmentRenderContext, RenderNode, FragmentPayload, HeadOp } from './types'

const FRAGMENT_MAGIC = 0x46524147
const TREE_MAGIC = 0x54524545
const TREE_NODE_SIZE = 24
const ATTR_SIZE = 8
const UINT32_MAX = 0xffffffff

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export const buildFragmentMeta = (definition: FragmentDefinition, cacheKey: string = definition.id): FragmentMeta => ({
  cacheKey,
  ttl: definition.ttl,
  staleTtl: definition.staleTtl,
  tags: definition.tags,
  runtime: definition.runtime
})

type NodeRecord = {
  type: number
  tagId: number
  textId: number
  firstChild: number
  nextSibling: number
  attrStart: number
  attrCount: number
}

export const encodeTree = (root: RenderNode): Uint8Array => {
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
      firstChild: UINT32_MAX,
      nextSibling: UINT32_MAX,
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

    let prevChild = UINT32_MAX
    const children = node.children ?? []
    children.forEach((child) => {
      const childIndex = addNode(child)
      if (record.firstChild === UINT32_MAX) {
        record.firstChild = childIndex
      }
      if (prevChild !== UINT32_MAX) {
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

const encodeFragmentPayloadFromParts = (
  treeBytes: Uint8Array,
  headBytes: Uint8Array,
  cssBytes: Uint8Array,
  metaBytes: Uint8Array
) => {
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

export const encodeFragmentPayloadFromTree = (
  definition: FragmentDefinition,
  tree: RenderNode,
  cacheKey: string = definition.id
): Uint8Array => {
  const treeBytes = encodeTree(tree)
  const headBytes = definition.head.length ? encoder.encode(JSON.stringify(definition.head)) : new Uint8Array(0)
  const cssBytes = definition.css ? encoder.encode(definition.css) : new Uint8Array(0)
  const metaBytes = encoder.encode(JSON.stringify(buildFragmentMeta(definition, cacheKey)))

  return encodeFragmentPayloadFromParts(treeBytes, headBytes, cssBytes, metaBytes)
}

export const encodeFragmentPayload = async (
  definition: FragmentDefinition,
  context: FragmentRenderContext
): Promise<Uint8Array> => {
  const tree = await definition.render(context)
  return encodeFragmentPayloadFromTree(definition, tree)
}

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
  const _stringBytesLength = view.getUint32(20, true)

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
    const _nextSibling = view.getUint32(base + 16, true)
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
    while (childIndex !== UINT32_MAX) {
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
