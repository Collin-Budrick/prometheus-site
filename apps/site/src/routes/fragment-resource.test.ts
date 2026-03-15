import { beforeEach, describe, expect, it } from 'bun:test'
import { fragmentPlanCache } from '../fragment/plan-cache'
import { loadStaticFragmentResource } from './fragment-resource'

const joinInitialHtml = (value: Awaited<ReturnType<typeof loadStaticFragmentResource>>) =>
  Object.values(value.initialHtml ?? {}).join('\n')

beforeEach(() => {
  fragmentPlanCache.clear?.()
})

describe('loadStaticFragmentResource', () => {
  it('renders localized home fragments for japanese static snapshots', async () => {
    const resource = await loadStaticFragmentResource('/', 'ja')
    const html = joinInitialHtml(resource)

    expect(html).toContain('レンダリングの前にプランナーが実行されます。')
    expect(html).toContain('Reactはサーバー専用です。')
    expect(html).not.toContain('Planner executes before rendering.')
    expect(html).not.toContain('React stays server-only.')
  })

  it('renders localized store fragments for korean static snapshots', async () => {
    const resource = await loadStaticFragmentResource('/store', 'ko')
    const html = joinInitialHtml(resource)

    expect(html).toContain('스토어 검색...')
    expect(html).toContain('장바구니')
    expect(html).toContain('drizzle-zod로 검증하고 업데이트를 실시간으로 스트리밍합니다.')
    expect(html).not.toContain('Search the store...')
    expect(html).not.toContain('Validated by drizzle-zod and streamed over realtime updates.')
  })

  it('renders localized chat fragments for japanese static snapshots', async () => {
    const resource = await loadStaticFragmentResource('/chat', 'ja')
    const html = joinInitialHtml(resource)

    expect(html).toContain('ユーザー ID で検索して接続します。')
    expect(html).toContain('ユーザー ID で検索')
    expect(html).not.toContain('Search by user ID to connect.')
    expect(html).not.toContain('Search by user ID')
  })
})
