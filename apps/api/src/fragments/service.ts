import { encodeFragmentPayloadFromTree } from './binary'
import { getFragmentDefinition } from './definitions'
import { planForPath } from './planner'
import {
  acquireFragmentLock,
  fragmentLockTtlMs,
  isFragmentLockHeld,
  readFragment,
  releaseFragmentLock,
  type StoredFragment,
  writeFragment
} from './store'
import { h, renderToHtml, t } from './tree'
import type { FragmentCacheStatus, FragmentPlan, FragmentPlanEntry } from './types'

const inflight = new Map<string, Promise<StoredFragment>>()
const lockWaitMs = fragmentLockTtlMs
const lockPollMs = 50

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const buildEntry = async (
  id: string,
  payload: Uint8Array,
  html: string | undefined,
  ttlSeconds: number,
  staleSeconds: number
): Promise<StoredFragment> => {
  const now = Date.now()
  return {
    payload,
    html,
    meta: {
      cacheKey: id,
      ttl: ttlSeconds,
      staleTtl: staleSeconds,
      tags: ['rendered'],
      runtime: 'edge'
    },
    updatedAt: now,
    staleAt: now + ttlSeconds * 1000,
    expiresAt: now + (ttlSeconds + staleSeconds) * 1000
  }
}

const renderDefinition = async (id: string): Promise<StoredFragment> => {
  const definition = getFragmentDefinition(id)
  if (!definition) {
    const fallback = {
      id,
      ttl: 10,
      staleTtl: 30,
      tags: ['fallback'],
      runtime: 'node' as const,
      head: [],
      css: '',
      render: () =>
        h('section', null, [
          h('div', { class: 'meta-line' }, [t('fragment missing')]),
          h('h2', null, t('Fragment missing')),
          h('p', null, t(`No renderer registered for ${id}.`))
        ])
    }
    const tree = await fallback.render()
    const payload = encodeFragmentPayloadFromTree(fallback, tree)
    const html = renderToHtml(tree)
    return buildEntry(id, payload, html, fallback.ttl, fallback.staleTtl)
  }

  const tree = await definition.render()
  const payload = encodeFragmentPayloadFromTree(definition, tree)
  const html = renderToHtml(tree)
  const entry = await buildEntry(definition.id, payload, html, definition.ttl, definition.staleTtl)
  entry.meta.tags = definition.tags
  entry.meta.runtime = definition.runtime
  return entry
}

const waitForCachedFragment = async (id: string, deadline: number): Promise<StoredFragment | null> => {
  while (Date.now() < deadline) {
    const cached = await readFragment(id)
    if (cached) return cached
    const locked = await isFragmentLockHeld(id)
    if (!locked) return null
    await sleep(lockPollMs)
  }
  return null
}

export const refreshFragment = async (id: string): Promise<StoredFragment> => {
  const existing = inflight.get(id)
  if (existing) return existing

  const task = (async () => {
    let lockToken: string | null = null
    try {
      lockToken = await acquireFragmentLock(id)
      if (!lockToken) {
        const cached = await waitForCachedFragment(id, Date.now() + lockWaitMs)
        if (cached) return cached
        lockToken = await acquireFragmentLock(id)
      }
      const entry = await renderDefinition(id)
      await writeFragment(id, entry)
      return entry
    } catch (error) {
      const cached = await readFragment(id)
      if (cached) return cached

      const fallback = {
        id,
        ttl: 5,
        staleTtl: 10,
        tags: ['error'],
        runtime: 'node' as const,
        head: [],
        css: '',
        render: () =>
          h('section', null, [
            h('div', { class: 'meta-line' }, [t('render error')]),
            h('h2', null, t('Fragment failed to render')),
            h('p', null, t(`Last error: ${error instanceof Error ? error.message : 'unknown'}`))
          ])
      }
      const tree = await fallback.render()
      const payload = encodeFragmentPayloadFromTree(fallback, tree)
      const html = renderToHtml(tree)
      return buildEntry(id, payload, html, fallback.ttl, fallback.staleTtl)
    } finally {
      if (lockToken) {
        void releaseFragmentLock(id, lockToken)
      }
      inflight.delete(id)
    }
  })()

  inflight.set(id, task)
  return task
}

const scheduleRefresh = (id: string) => {
  queueMicrotask(() => {
    void refreshFragment(id)
  })
}

const getOrRender = async (id: string): Promise<StoredFragment> => {
  const cached = await readFragment(id)
  const now = Date.now()

  if (cached) {
    if (now < cached.staleAt) {
      return cached
    }

    if (now < cached.expiresAt) {
      scheduleRefresh(id)
      return cached
    }
  }

  return refreshFragment(id)
}

export const buildCacheStatus = (cached: StoredFragment | null, now: number): FragmentCacheStatus => {
  if (!cached) {
    return { status: 'miss' }
  }

  const base = {
    updatedAt: cached.updatedAt,
    staleAt: cached.staleAt,
    expiresAt: cached.expiresAt
  }

  if (now < cached.staleAt) {
    return { status: 'hit', ...base }
  }

  if (now < cached.expiresAt) {
    return { status: 'stale', ...base }
  }

  return { status: 'miss', ...base }
}

const annotatePlanEntry = async (entry: FragmentPlanEntry, now: number): Promise<FragmentPlanEntry> => {
  const definition = getFragmentDefinition(entry.id)
  const cached = await readFragment(entry.id)
  const cache = buildCacheStatus(cached, now)

  if (cache.status !== 'hit') {
    scheduleRefresh(entry.id)
  }

  return {
    ...entry,
    runtime: definition?.runtime ?? 'node',
    cache
  }
}

export const getFragmentPlan = async (path: string): Promise<FragmentPlan> => {
  const plan = planForPath(path)
  const now = Date.now()
  const fragments = await Promise.all(plan.fragments.map((entry) => annotatePlanEntry(entry, now)))
  return { ...plan, fragments }
}

type FragmentFetchOptions = {
  refresh?: boolean
}

export const getFragmentEntry = async (id: string, options: FragmentFetchOptions = {}) =>
  options.refresh ? refreshFragment(id) : getOrRender(id)

export const getFragmentPayload = async (id: string, options?: FragmentFetchOptions) =>
  (await getFragmentEntry(id, options)).payload
export const getFragmentHtml = async (id: string, options?: FragmentFetchOptions) => (await getFragmentEntry(id, options)).html

export const streamFragmentsForPath = async (path: string) => {
  const plan = await getFragmentPlan(path)
  const encoder = new TextEncoder()
  const fetchGroups =
    plan.fetchGroups && plan.fetchGroups.length ? plan.fetchGroups : [plan.fragments.map((entry) => entry.id)]

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const group of fetchGroups) {
        if (!group.length) continue
        const pending = new Map<string, Promise<Uint8Array>>()
        group.forEach((id) => {
          pending.set(id, getFragmentPayload(id))
        })

        const raceEntries = async () => {
          const entries = Array.from(pending.entries()).map(([id, promise]) =>
            promise.then((payload) => ({ id, payload }))
          )
          return Promise.race(entries)
        }

        while (pending.size) {
          const { id, payload } = await raceEntries()
          pending.delete(id)

          const idBytes = encoder.encode(id)
          const header = new ArrayBuffer(8)
          const view = new DataView(header)
          view.setUint32(0, idBytes.length, true)
          view.setUint32(4, payload.length, true)

          controller.enqueue(new Uint8Array(header))
          controller.enqueue(idBytes)
          controller.enqueue(payload)
        }
      }

      controller.close()
    }
  })

  return stream
}
