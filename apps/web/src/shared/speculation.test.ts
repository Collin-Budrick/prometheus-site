import { describe, expect, it } from 'bun:test'

import type { FragmentPlan } from '../fragment/types'
import { buildSpeculationRulesForPlan } from './speculation'

const basePlan: FragmentPlan = {
  path: '/',
  fragments: [
    { id: 'fragment://page/home/hero@v1', critical: true, layout: { column: 'span 7' } },
    { id: 'fragment://page/home/planner@v1', critical: true, layout: { column: 'span 5' } }
  ],
  createdAt: Date.now()
}

describe('buildSpeculationRulesForPlan', () => {
  it('returns null when the API base is missing', () => {
    expect(buildSpeculationRulesForPlan(basePlan, {})).toBeNull()
  })

  it('omits cross-origin bases', () => {
    const rules = buildSpeculationRulesForPlan(basePlan, { VITE_API_BASE: 'https://api.example.com' }, { origin: 'https://prometheus.dev' })

    expect(rules).toBeNull()
  })

  it('builds list-based prefetch rules for the plan and fragments', () => {
    const rules = buildSpeculationRulesForPlan(
      basePlan,
      { VITE_API_BASE: '/api' },
      {
        origin: 'https://prometheus.dev',
        knownFragments: {
          'fragment://page/home/planner@v1': {} as never
        }
      }
    )

    expect(rules?.prefetchRules?.[0].urls).toEqual([
      'https://prometheus.dev/api/fragments/plan?path=%2F',
      'https://prometheus.dev/api/fragments/stream?path=%2F',
      'https://prometheus.dev/api/fragments?id=fragment%3A%2F%2Fpage%2Fhome%2Fhero%40v1'
    ])
  })

  it('omits plan + stream URLs when the current path is already cached', () => {
    const rules = buildSpeculationRulesForPlan(
      basePlan,
      { VITE_API_BASE: '/api' },
      {
        origin: 'https://prometheus.dev',
        currentPath: '/',
        knownFragments: {
          'fragment://page/home/hero@v1': {} as never
        }
      }
    )

    expect(rules?.prefetchRules?.[0].urls).toEqual([
      'https://prometheus.dev/api/fragments?id=fragment%3A%2F%2Fpage%2Fhome%2Fplanner%40v1'
    ])
  })

  it('filters out URLs already queued via link prefetch', () => {
    const rules = buildSpeculationRulesForPlan(
      basePlan,
      { VITE_API_BASE: '/api' },
      {
        origin: 'https://prometheus.dev',
        documentRef: {
          querySelectorAll: () => [
            { href: 'https://prometheus.dev/api/fragments/plan?path=%2F' }
          ]
        }
      }
    )

    expect(rules?.prefetchRules?.[0].urls).toEqual([
      'https://prometheus.dev/api/fragments/stream?path=%2F',
      'https://prometheus.dev/api/fragments?id=fragment%3A%2F%2Fpage%2Fhome%2Fhero%40v1',
      'https://prometheus.dev/api/fragments?id=fragment%3A%2F%2Fpage%2Fhome%2Fplanner%40v1'
    ])
  })
})
