import { getFragmentDefinition } from './definitions'
import type { EarlyHint, FragmentPlan, FragmentPlanEntry } from './types'

const shellEarlyHints: EarlyHint[] = []

const buildEarlyHints = () => shellEarlyHints.slice(0, 5)

export const normalizePlanPath = (path: string) => (path === '/' || path === '' ? '/' : path)

const attachDependencies = (entries: FragmentPlanEntry[]) => {
  const ids = new Set(entries.map((entry) => entry.id))
  return entries.map((entry) => {
    const definition = getFragmentDefinition(entry.id)
    const dependsOn = definition?.dependsOn?.filter((id) => ids.has(id) && id !== entry.id)
    if (dependsOn === undefined || dependsOn.length === 0) return entry
    return { ...entry, dependsOn }
  })
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

export const planForPath = (path: string): FragmentPlan => {
  const normalized = normalizePlanPath(path)

  if (normalized === '/') {
    const baseFragments: FragmentPlanEntry[] = [
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
    const fragmentsWithDeps = attachDependencies(baseFragments)
    const { fragments, fetchGroups } = resolvePlanDependencies(fragmentsWithDeps)
    return {
      path: '/',
      createdAt: Date.now(),
      fragments,
      fetchGroups,
      earlyHints: buildEarlyHints()
    }
  }

  return {
    path: normalized,
    createdAt: Date.now(),
    fragments: [],
    earlyHints: buildEarlyHints()
  }
}
