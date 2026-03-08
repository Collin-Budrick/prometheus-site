import type { FragmentPlan } from '@core/fragment/types'

type InitialFragmentSelectionOptions = {
  dynamicCriticalIds?: string[]
}

export const selectInitialFragmentIds = (
  plan: FragmentPlan | undefined,
  options: InitialFragmentSelectionOptions = {}
) => {
  if (!plan) return []
  const entryById = new Map(plan.fragments.map((entry) => [entry.id, entry]))
  const critical = plan.fragments.filter((entry) => entry.critical).map((entry) => entry.id)
  const dynamicCritical = options.dynamicCriticalIds?.filter((id) => entryById.has(id)) ?? []
  const combined = Array.from(new Set([...critical, ...dynamicCritical]))
  const bootIds = plan.fragments
    .filter((entry) => {
      if (entry.bootMode) {
        return entry.bootMode !== 'stream'
      }
      return entry.critical
    })
    .map((entry) => entry.id)
  const seedIds = bootIds.length ? bootIds : combined.length ? combined : plan.fragments.map((entry) => entry.id)
  const required = new Set<string>()
  const stack = [...seedIds]
  while (stack.length) {
    const id = stack.pop()
    if (!id || required.has(id)) continue
    required.add(id)
    const deps = entryById.get(id)?.dependsOn ?? []
    deps.forEach((dep) => {
      if (!required.has(dep)) stack.push(dep)
    })
  }
  return Array.from(required)
}
