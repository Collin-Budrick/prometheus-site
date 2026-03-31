import type { RenderNode } from '@core/fragment/types'
import {
  buildPretextTextAttrs,
  mergeNodeAttrs,
  PRETEXT_BODY_SPEC,
  PRETEXT_COMPACT_BODY_SPEC,
  PRETEXT_META_SPEC,
  PRETEXT_PILL_SPEC,
  PRETEXT_TITLE_SPEC,
  type PretextRole,
  type PretextStaticWidthKind
} from './pretext-static'

const META_CLASSES = new Set([
  'home-demo-compact-kicker',
  'home-demo-compact-meta',
  'home-fragment-shell-meta',
  'meta-line'
])

const PILL_CLASSES = new Set([
  'badge',
  'home-demo-compact-action',
  'home-fragment-metric',
  'home-intro-pill',
  'home-manifest-pill'
])

const BODY_CLASSES = new Set([
  'home-demo-compact-copy',
  'home-fragment-copy',
  'home-fragment-shell-copy',
  'home-fragment-stub-copy',
  'home-manifest-copy'
])

const COMPACT_BODY_CLASSES = new Set([
  'home-fragment-copy',
  'home-fragment-shell-copy',
  'home-fragment-stub-copy',
  'home-manifest-copy'
])

const splitClassList = (value?: string) =>
  (value ?? '')
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean)

const normalizeTextContent = (value: string) => value.replace(/\s+/g, ' ').trim()

const collectRenderNodeText = (node: RenderNode): string => {
  if (node.type === 'text') {
    return node.text ?? ''
  }

  return (node.children ?? [])
    .map((child) => collectRenderNodeText(child))
    .join(' ')
}

const resolveRenderNodeRole = (node: RenderNode): PretextRole | null => {
  if (node.type !== 'element') {
    return null
  }

  const explicit = node.attrs?.['data-pretext-role']
  if (explicit === 'body' || explicit === 'meta' || explicit === 'pill' || explicit === 'title') {
    return explicit
  }

  const classes = splitClassList(node.attrs?.class)
  if (classes.some((className) => META_CLASSES.has(className))) {
    return 'meta'
  }
  if (classes.some((className) => PILL_CLASSES.has(className))) {
    return 'pill'
  }
  if (classes.some((className) => BODY_CLASSES.has(className))) {
    return 'body'
  }

  switch (node.tag) {
    case 'h1':
    case 'h2':
    case 'h3':
      return 'title'
    case 'p':
      return 'body'
    default:
      return null
  }
}

const resolveBodySpec = (node: RenderNode) => {
  if (node.type !== 'element') {
    return PRETEXT_BODY_SPEC
  }
  const classes = splitClassList(node.attrs?.class)
  return classes.some((className) => COMPACT_BODY_CLASSES.has(className))
    ? PRETEXT_COMPACT_BODY_SPEC
    : PRETEXT_BODY_SPEC
}

const resolveMaxWidthCh = (node: RenderNode, role: PretextRole) => {
  if (role === 'title') {
    return 42
  }
  if (role !== 'body') {
    return undefined
  }

  if (node.type !== 'element') {
    return 64
  }

  const classes = splitClassList(node.attrs?.class)
  if (
    classes.some((className) =>
      COMPACT_BODY_CLASSES.has(className) || className === 'home-intro-copy-line'
    )
  ) {
    return 64
  }

  return undefined
}

const resolveRoleSpec = (node: RenderNode, role: PretextRole) => {
  switch (role) {
    case 'meta':
      return PRETEXT_META_SPEC
    case 'pill':
      return PRETEXT_PILL_SPEC
    case 'title':
      return PRETEXT_TITLE_SPEC
    case 'body':
    default:
      return resolveBodySpec(node)
  }
}

export const annotateRenderNodePretext = (
  node: RenderNode,
  {
    lang,
    widthKind
  }: {
    lang: string
    widthKind: PretextStaticWidthKind
  }
): RenderNode => {
  if (node.type !== 'element') {
    return node
  }

  const nextChildren = node.children?.map((child) =>
    annotateRenderNodePretext(child, {
      lang,
      widthKind
    })
  )
  const role = resolveRenderNodeRole(node)
  if (!role) {
    return {
      ...node,
      ...(nextChildren ? { children: nextChildren } : {})
    }
  }

  const text = normalizeTextContent(
    collectRenderNodeText({
      ...node,
      ...(nextChildren ? { children: nextChildren } : {})
    })
  )
  if (!text) {
    return {
      ...node,
      ...(nextChildren ? { children: nextChildren } : {})
    }
  }

  const spec = resolveRoleSpec(node, role)

  return {
    ...node,
    attrs: mergeNodeAttrs(
      node.attrs,
      buildPretextTextAttrs({
        ...spec,
        lang,
        ...(resolveMaxWidthCh(node, role) ? { maxWidthCh: resolveMaxWidthCh(node, role) } : {}),
        role,
        text,
        widthKind
      })
    ),
    ...(nextChildren ? { children: nextChildren } : {})
  }
}
