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
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')

const hasRenderableProps = (props?: Record<string, unknown>) =>
  Object.keys(normalizeProps(props)).length > 0

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
      ...(hasRenderableProps(props)
        ? [
            h(
              'template',
              {
                'data-fragment-widget-props': 'true'
              },
              [toScriptJson(props)]
            )
          ]
        : [])
    ]
  )
