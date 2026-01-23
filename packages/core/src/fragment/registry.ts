import type { FragmentDefinition, FragmentPlan, FragmentPlanEntry } from './types'

const normalizePlanPath = (path: string) => {
  const trimmed = path.trim()
  if (trimmed === '' || trimmed === '/') return '/'
  const stripped = trimmed.replace(/\/+$/, '')
  return stripped === '' ? '/' : stripped
}

type PlanBuilder = (path: string, normalizedPath: string) => FragmentPlan
type PlanOverride = (plan: FragmentPlan) => FragmentPlan

const fragmentRegistry = new Map<string, FragmentDefinition>()
let planBuilder: PlanBuilder | null = null
const planOverrides: PlanOverride[] = []

export const registerFragmentDefinitions = (definitions: Iterable<FragmentDefinition>) => {
  Array.from(definitions).forEach((definition) => {
    fragmentRegistry.set(definition.id, definition)
  })
}

export const registerFragmentDefinition = (definition: FragmentDefinition) => {
  fragmentRegistry.set(definition.id, definition)
}

export const clearFragmentDefinitions = () => {
  fragmentRegistry.clear()
}

export const getFragmentDefinition = (id: string) => fragmentRegistry.get(id)

export const getAllFragmentDefinitions = () => Array.from(fragmentRegistry.values())

export const setFragmentPlanBuilder = (builder: PlanBuilder | null) => {
  planBuilder = builder
}

export const getFragmentPlanBuilder = () => planBuilder

export const registerFragmentPlanOverride = (override: PlanOverride) => {
  planOverrides.push(override)
}

export const clearFragmentPlanOverrides = () => {
  planOverrides.splice(0, planOverrides.length)
}

export const applyPlanOverrides = (plan: FragmentPlan): FragmentPlan =>
  planOverrides.reduce((current, override) => override(current), plan)

export const normalizeAndApplyPlan = (plan: FragmentPlan): FragmentPlan => {
  const normalizedPath = normalizePlanPath(plan.path)
  const overridden = applyPlanOverrides({ ...plan, path: normalizedPath })
  const fragments = overridden.fragments.map((entry) =>
    entry.renderHtml === undefined ? { ...entry, renderHtml: true } : entry
  )
  return { ...overridden, fragments }
}

export const buildPlanFromBuilder = (path: string, fallback?: FragmentPlan): FragmentPlan => {
  const normalized = normalizePlanPath(path)
  const basePlan = planBuilder ? planBuilder(path, normalized) : fallback ?? { path: normalized, fragments: [], createdAt: Date.now() }
  return normalizeAndApplyPlan(basePlan)
}

export const attachDefinitionDependencies = (entries: FragmentPlanEntry[]) => {
  const ids = new Set(entries.map((entry) => entry.id))
  return entries.map((entry) => {
    const definition = getFragmentDefinition(entry.id)
    const dependsOn = definition?.dependsOn?.filter((id) => ids.has(id) && id !== entry.id)
    if (!dependsOn?.length) return entry
    return { ...entry, dependsOn }
  })
}
