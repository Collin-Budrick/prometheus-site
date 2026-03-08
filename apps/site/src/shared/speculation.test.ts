import { describe, expect, it } from 'bun:test'

import type { FragmentPlan } from '../../../../packages/core/src/fragment/types'
import { buildSpeculationRulesForPlan } from '../../../../packages/core/src/fragment/speculation'

const basePlan: FragmentPlan = {
  path: '/',
  fragments: [
    { id: 'fragment://page/home/planner@v1', critical: true, layout: { column: 'span 5' } },
    { id: 'fragment://page/home/ledger@v1', critical: true, layout: { column: 'span 7' } },
    { id: 'fragment://page/home/feed@v1', critical: true, layout: { column: 'span 12' } }
  ],
  createdAt: Date.now()
}

describe('buildSpeculationRulesForPlan', () => {
  it('returns null when the API base is missing', () => {
    expect(buildSpeculationRulesForPlan(basePlan, '')).toBeNull()
  })

  it('omits cross-origin bases', () => {
    const rules = buildSpeculationRulesForPlan(
      basePlan,
      'https://api.example.com',
      { origin: 'https://prometheus.dev' }
    )

    expect(rules).toBeNull()
  })

  it('builds list-based prefetch rules for the plan and fragments', () => {
    const rules = buildSpeculationRulesForPlan(
      basePlan,
      '/api',
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
      'https://prometheus.dev/api/fragments?id=fragment%3A%2F%2Fpage%2Fhome%2Fledger%40v1',
      'https://prometheus.dev/api/fragments?id=fragment%3A%2F%2Fpage%2Fhome%2Ffeed%40v1'
    ])
  })

  it('omits plan + stream URLs when the current path is already cached', () => {
    const rules = buildSpeculationRulesForPlan(
      basePlan,
      '/api',
      {
        origin: 'https://prometheus.dev',
        currentPath: '/',
        knownFragments: {
          'fragment://page/home/planner@v1': {} as never
        }
      }
    )

    expect(rules).toBeNull()
  })

  it('filters out URLs already queued via link prefetch', () => {
    const rules = buildSpeculationRulesForPlan(
      basePlan,
      '/api',
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
      'https://prometheus.dev/api/fragments?id=fragment%3A%2F%2Fpage%2Fhome%2Fplanner%40v1',
      'https://prometheus.dev/api/fragments?id=fragment%3A%2F%2Fpage%2Fhome%2Fledger%40v1',
      'https://prometheus.dev/api/fragments?id=fragment%3A%2F%2Fpage%2Fhome%2Ffeed%40v1'
    ])
  })

  it('skips plan and stream URLs on the initial load for the current route', () => {
    const rules = buildSpeculationRulesForPlan(
      basePlan,
      '/api',
      {
        origin: 'https://prometheus.dev',
        currentPath: '/',
        initialLoad: true
      }
    )

    expect(rules?.prefetchRules?.[0].urls).toEqual([
      'https://prometheus.dev/api/fragments?id=fragment%3A%2F%2Fpage%2Fhome%2Fplanner%40v1',
      'https://prometheus.dev/api/fragments?id=fragment%3A%2F%2Fpage%2Fhome%2Fledger%40v1'
    ])
  })

  it('caps initial current-route fragment speculation to the configured limit', () => {
    const rules = buildSpeculationRulesForPlan(
      basePlan,
      '/api',
      {
        origin: 'https://prometheus.dev',
        currentPath: '/',
        initialLoad: true,
        maxInitialPrefetchUrls: 1
      }
    )

    expect(rules?.prefetchRules?.[0].urls).toEqual([
      'https://prometheus.dev/api/fragments?id=fragment%3A%2F%2Fpage%2Fhome%2Fplanner%40v1'
    ])
  })

  it('returns no speculation rules on slow or data-saving initial loads', () => {
    const rules = buildSpeculationRulesForPlan(
      basePlan,
      '/api',
      {
        origin: 'https://prometheus.dev',
        currentPath: '/',
        initialLoad: true,
        saveData: true,
        effectiveType: '2g'
      }
    )

    expect(rules).toBeNull()
  })

  it('preserves current-route skip behavior when fragments are already known on the initial load', () => {
    const rules = buildSpeculationRulesForPlan(
      basePlan,
      '/api',
      {
        origin: 'https://prometheus.dev',
        currentPath: '/',
        initialLoad: true,
        knownFragments: {
          'fragment://page/home/planner@v1': {} as never
        }
      }
    )

    expect(rules).toBeNull()
  })
})
