import { siteBrand } from '../site-config'
import type { FragmentPayload, RenderNode } from '../fragment/types'

const textNode = (text: string): RenderNode => ({ type: 'text', text })

const elementNode = (tag: string, attrs?: Record<string, string>, children: RenderNode[] = []): RenderNode => ({
  type: 'element',
  tag,
  attrs,
  children
})

export const offlineShellFragmentId = 'fragment://fallback/offline-shell@v1'

export const buildOfflineShellFragment = (id: string, path: string): FragmentPayload => ({
  id,
  css: '',
  head: [{ op: 'title', value: `${siteBrand.name} | Offline` }],
  meta: {
    cacheKey: id,
    ttl: 30,
    staleTtl: 300,
    tags: ['fallback', 'offline', 'shell'],
    runtime: 'node'
  },
  tree: elementNode('section', { class: 'offline-shell' }, [
    elementNode('div', { class: 'meta-line' }, [textNode('offline mode')]),
    elementNode('h1', undefined, [textNode('You are offline')]),
    elementNode('p', undefined, [textNode('The shell is available, but live fragments need connectivity.')]),
    elementNode('div', { class: 'matrix' }, [
      elementNode('div', { class: 'cell' }, [
        textNode('Route'),
        elementNode('strong', undefined, [textNode(path || '/')])
      ]),
      elementNode('div', { class: 'cell' }, [
        textNode('Status'),
        elementNode('strong', undefined, [textNode('Offline')])
      ])
    ]),
    elementNode('ul', { class: 'inline-list' }, [
      elementNode('li', undefined, [elementNode('span'), textNode('Check your connection')]),
      elementNode('li', undefined, [elementNode('span'), textNode('Refresh once you are back online')]),
      elementNode('li', undefined, [elementNode('span'), textNode('Cached content will load where available')])
    ])
  ])
})
