import { describe, expect, it } from 'bun:test'
import { encodeFragmentPayloadFromTree } from '@core/fragment/binary'
import { h, t } from '@core/fragment/tree'
import type { FragmentDefinition } from '@core/fragment/types'
import { decodeRuntimeFragmentPayload } from './decode-payload'

const definition: FragmentDefinition = {
  id: 'fragment://tests/runtime/decode@v1',
  ttl: 30,
  staleTtl: 60,
  tags: ['test'],
  runtime: 'edge',
  head: [],
  css: '.demo{display:block;}',
  render: () => h('section', { class: 'demo' }, [t('hello')])
}

describe('decodeRuntimeFragmentPayload', () => {
  it('preserves the requested fragment id when decoding fragment bytes', () => {
    const bytes = encodeFragmentPayloadFromTree(
      definition,
      h('section', { class: 'demo' }, [t('hello')]),
      definition.id,
      '<section class="demo">hello</section>'
    )

    const payload = decodeRuntimeFragmentPayload('fragment://tests/runtime/override@v1', bytes)

    expect(payload.id).toBe('fragment://tests/runtime/override@v1')
    expect(payload.meta.cacheKey).toBe(definition.id)
    expect(payload.html).toBe('<section class="demo">hello</section>')
  })
})
