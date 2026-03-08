import type { RenderNode } from '../types'

const TREE_RENDER_ONLY_TAGS: Record<string, true> = {
  'planner-demo': true,
  'wasm-renderer-demo': true,
  'react-binary-demo': true,
  'preact-island': true
}

export const requiresTreeRenderer = (node: RenderNode | null | undefined): boolean => {
  if (!node || node.type !== 'element') return false
  if (TREE_RENDER_ONLY_TAGS[node.tag]) return true
  return node.children?.some((child) => requiresTreeRenderer(child)) ?? false
}
