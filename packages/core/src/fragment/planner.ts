import type { EarlyHint, FragmentPlan, FragmentPlanEntry } from './types'
import { attachDefinitionDependencies, buildPlanFromBuilder } from './registry'

export const normalizePlanPath = (path: string) => {
  const trimmed = path.trim()
  if (trimmed === '' || trimmed === '/') return '/'
  const stripped = trimmed.replace(/\/+$/, '')
  return stripped === '' ? '/' : stripped
}

const resolvePlanDependencies = (entries: FragmentPlanEntry[]) => {
  if (entries.length === 0) {
    return { fragments: entries, fetchGroups: [] as string[][] }
  }

  const orderIndex = new Map(entries.map((entry, index) => [entry.id, index]))
  const entryById = new Map(entries.map((entry) => [entry.id, entry]))
  const dependents = new Map<string, string[]>()
  const depsMap = new Map<string, string[]>()

  entries.forEach((entry) => {
    const deps = (entry.dependsOn ?? []).filter((dep) => entryById.has(dep) && dep !== entry.id)
    depsMap.set(entry.id, deps)
    deps.forEach((dep) => {
      const list = dependents.get(dep)
      if (list) {
        list.push(entry.id)
      } else {
        dependents.set(dep, [entry.id])
      }
    })
  })

  const indegree = new Map<string, number>()
  entries.forEach((entry) => {
    indegree.set(entry.id, depsMap.get(entry.id)?.length ?? 0)
  })

  const sortIds = (ids: string[]) => ids.sort((a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0))

  let ready = sortIds(entries.filter((entry) => (indegree.get(entry.id) ?? 0) === 0).map((entry) => entry.id))
  const ordered: FragmentPlanEntry[] = []
  const groups: string[][] = []
  const processed = new Set<string>()

  while (ready.length > 0) {
    groups.push([...ready])
    const nextReady = new Set<string>()
    for (const id of ready) {
      processed.add(id)
      const entry = entryById.get(id)
      if (entry) ordered.push(entry)
      const outgoing = dependents.get(id) ?? []
      for (const dependent of outgoing) {
        indegree.set(dependent, (indegree.get(dependent) ?? 0) - 1)
        if ((indegree.get(dependent) ?? 0) === 0 && !processed.has(dependent)) {
          nextReady.add(dependent)
        }
      }
    }
    ready = sortIds(Array.from(nextReady))
  }

  if (ordered.length !== entries.length) {
    return { fragments: entries, fetchGroups: [entries.map((entry) => entry.id)] }
  }

  return { fragments: ordered, fetchGroups: groups }
}

export const buildFragmentPlan = (path: string, fragments: FragmentPlanEntry[], earlyHints?: EarlyHint[]): FragmentPlan => {
  const normalized = normalizePlanPath(path)
  const fragmentsWithDeps = attachDefinitionDependencies(fragments)
  const { fragments: ordered, fetchGroups } = resolvePlanDependencies(fragmentsWithDeps)
  return {
    path: normalized,
    createdAt: Date.now(),
    fragments: ordered,
    fetchGroups,
    earlyHints
  }
}

export const planForPath = (path: string): FragmentPlan => buildPlanFromBuilder(path, buildFragmentPlan(path, [], []))
