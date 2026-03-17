import { h } from '@core/fragment/tree'
import type { RenderNode } from '@core/fragment/types'

export type FragmentWidgetPriority = 'critical' | 'visible' | 'deferred'

export type FragmentWidgetMarkerNodeOptions = {
  kind: string
  id: string
  priority?: FragmentWidgetPriority
  props?: Record<string, unknown>
  shell: RenderNode
  mountInShell?: boolean
}

const normalizeProps = (props?: Record<string, unknown>) => props ?? {}

const toScriptJson = (props?: Record<string, unknown>) =>
  JSON.stringify(normalizeProps(props))

export const buildFragmentWidgetId = (fragmentId: string, kind: string, localKey?: string) =>
  [fragmentId, kind, localKey].filter(Boolean).join('::')

export const createFragmentWidgetMarkerNode = ({
  kind,
  id,
  priority = 'visible',
  props,
  shell,
  mountInShell = true
}: FragmentWidgetMarkerNodeOptions): RenderNode =>
  h(
    'div',
    {
      'data-fragment-widget': kind,
      'data-fragment-widget-id': id,
      'data-fragment-widget-priority': priority,
      'data-fragment-widget-hydrated': 'false'
    },
    [
      h(
        'div',
        {
          'data-fragment-widget-shell': 'true',
          ...(mountInShell ? { 'data-fragment-widget-mount': 'true' } : {})
        },
        [shell]
      ),
      h(
        'script',
        {
          type: 'application/json',
          'data-fragment-widget-props': 'true'
        },
        [toScriptJson(props)]
      )
    ]
  )
