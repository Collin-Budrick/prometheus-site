import { buildFragmentPlan, setFragmentPlanBuilder } from '@core/fragments'

const homeFragments = [
  {
    id: 'fragment://page/home/hero@v1',
    critical: true,
    layout: { column: 'span 7' }
  },
  {
    id: 'fragment://page/home/planner@v1',
    critical: true,
    layout: { column: 'span 5' }
  },
  {
    id: 'fragment://page/home/ledger@v1',
    critical: false,
    layout: { column: 'span 7' }
  },
  {
    id: 'fragment://page/home/island@v1',
    critical: false,
    layout: { column: 'span 5' }
  },
  {
    id: 'fragment://page/home/react@v1',
    critical: false,
    layout: { column: 'span 12' }
  },
  {
    id: 'fragment://page/home/dock@v1',
    critical: false,
    layout: { column: 'span 12' }
  }
]

setFragmentPlanBuilder((path, normalizedPath) => {
  if (normalizedPath === '/') {
    return buildFragmentPlan('/', homeFragments, [])
  }
  return buildFragmentPlan(normalizedPath, [], [])
})
