import { encodeFragmentPayloadFromTree } from './binary'
import { createFragmentTranslator, defaultFragmentLang, type FragmentLang, type FragmentTranslator } from './i18n'
import { normalizePlanPath, planForPath } from './planner'
import { getFragmentDefinition } from './registry'
import { h, renderToHtml, t as textNode } from './tree'
import type {
  FragmentCacheStatus,
  FragmentPlan,
  FragmentPlanEntry,
  FragmentDefinition,
  FragmentRenderContext
} from './types'
import { buildFragmentCacheKey, type FragmentStore, type StoredFragment } from './store'

export const fragmentLockTtlMs = 8_000
const lockWaitMs = fragmentLockTtlMs
const lockPollMs = 50
const minRefreshDelayMs = 100
const maxRefreshDelayMs = 400

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const randomRefreshDelay = () => Math.floor(Math.random() * (maxRefreshDelayMs - minRefreshDelayMs + 1)) + minRefreshDelayMs

type FragmentPlanMemoEntry = { expiresAt: number; plan: FragmentPlan }

export type FragmentServiceOptions = {
  store: FragmentStore
  createTranslator?: (lang: FragmentLang) => FragmentTranslator
  fallbackDefinitionFactory?: (id: string) => FragmentDefinition
  planMemoLimit?: number
  planMemoTtlMs?: number
}

export type FragmentPlanOptions = {
  basePlan?: FragmentPlan
  fragmentsByCacheKey?: Map<string, StoredFragment>
}

type FragmentFetchOptions = {
  refresh?: boolean
  lang?: FragmentLang
}

const defaultFallbackDefinition = (id: string): FragmentDefinition => ({
  id,
  ttl: 10,
  staleTtl: 30,
  tags: ['fallback'],
  runtime: 'node' as const,
  head: [],
  css: '',
  render: ({ t }) =>
    h('section', null, [
      h('div', { class: 'meta-line' }, [textNode(t('fragment missing'))]),
      h('h2', null, textNode(t('Fragment missing'))),
      h('p', null, textNode(t('No renderer registered for {{id}}.', { id })))
    ])
})

export const createFragmentService = ({
  store,
  createTranslator: createTranslatorOption,
  fallbackDefinitionFactory = defaultFallbackDefinition,
  planMemoLimit = 64,
  planMemoTtlMs = 10_000
}: FragmentServiceOptions) => {
  const fragmentPlanMemo = new Map<string, FragmentPlanMemoEntry>()
  const inflight = new Map<string, Promise<StoredFragment>>()
  const nextRefreshAt = new Map<string, number>()

  const buildPlanMemoKey = (path: string, lang: FragmentLang) => `${lang}|${normalizePlanPath(path)}`

  const pruneFragmentPlanMemo = () => {
    while (fragmentPlanMemo.size > planMemoLimit) {
      const oldest = fragmentPlanMemo.keys().next().value
      if (oldest === undefined) return
      fragmentPlanMemo.delete(oldest)
    }
  }

  const memoizePlan = (path: string, lang: FragmentLang, plan: FragmentPlan) => {
    const entry: FragmentPlanMemoEntry = { plan, expiresAt: Date.now() + planMemoTtlMs }
    const key = buildPlanMemoKey(path, lang)
    fragmentPlanMemo.set(key, entry)
    pruneFragmentPlanMemo()
  }

  const getPlanFromMemo = (path: string, lang: FragmentLang): FragmentPlan | null => {
    const key = buildPlanMemoKey(path, lang)
    const entry = fragmentPlanMemo.get(key)
    if (entry === undefined) return null
    if (entry.expiresAt <= Date.now()) {
      fragmentPlanMemo.delete(key)
      return null
    }
    fragmentPlanMemo.delete(key)
    fragmentPlanMemo.set(key, entry)
    return entry.plan
  }

  const clearPlanMemo = (path?: string, lang?: FragmentLang) => {
    if (path === undefined && lang === undefined) {
      fragmentPlanMemo.clear()
      return
    }
    const normalizedPath = path !== undefined ? normalizePlanPath(path) : null
    for (const key of Array.from(fragmentPlanMemo.keys())) {
      const [entryLang, ...rest] = key.split('|')
      const entryPath = rest.join('|')
      const matchesLang = lang === undefined || entryLang === lang
      const matchesPath = normalizedPath === null || entryPath === normalizedPath
      if (matchesLang && matchesPath) {
        fragmentPlanMemo.delete(key)
      }
    }
  }

  const buildAndMemoizePlan = (path: string, lang: FragmentLang) => {
    const normalized = normalizePlanPath(path)
    const plan = planForPath(normalized)
    memoizePlan(normalized, lang, plan)
    return plan
  }

  const buildEntry = (
    cacheKey: string,
    definition: FragmentDefinition,
    payload: Uint8Array,
    html: string | undefined
  ): StoredFragment => {
    const now = Date.now()
    return {
      payload,
      html,
      meta: {
        cacheKey,
        ttl: definition.ttl,
        staleTtl: definition.staleTtl,
        tags: definition.tags,
        runtime: definition.runtime
      },
      updatedAt: now,
      staleAt: now + definition.ttl * 1000,
      expiresAt: now + (definition.ttl + definition.staleTtl) * 1000
    }
  }

  const renderDefinitionFromContext = async (
    definition: FragmentDefinition,
    context: FragmentRenderContext
  ): Promise<StoredFragment> => {
    const cacheKey = buildFragmentCacheKey(definition.id, context.lang)
    const tree = await definition.render(context)
    const payload = encodeFragmentPayloadFromTree(definition, tree, cacheKey)
    const html = renderToHtml(tree)
    return buildEntry(cacheKey, definition, payload, html)
  }

  const renderDefinition = async (id: string, lang: FragmentLang): Promise<StoredFragment> => {
    const definition = getFragmentDefinition(id)
    const translate = (createTranslatorOption ?? createFragmentTranslator)(lang)
    const context: FragmentRenderContext = { lang, t: translate }

    if (definition === undefined) {
      return renderDefinitionFromContext(fallbackDefinitionFactory(id), context)
    }

    return renderDefinitionFromContext(definition, context)
  }

  const waitForCachedFragment = async (
    id: string,
    lang: FragmentLang,
    deadline: number
  ): Promise<StoredFragment | null> => {
    while (Date.now() < deadline) {
      const cached = await readFragment(id, lang)
      if (cached !== null) return cached
      const locked = await store.isLockHeld(id, lang)
      if (!locked) return null
      await sleep(lockPollMs)
    }
    return null
  }

  const readFragment = async (id: string, lang: FragmentLang = defaultFragmentLang) => {
    const cacheKey = buildFragmentCacheKey(id, lang)
    const cached = await store.readMany([cacheKey])
    return cached.get(cacheKey) ?? null
  }

  const writeFragment = async (
    id: string,
    lang: FragmentLang = defaultFragmentLang,
    entry: StoredFragment
  ) => {
    const cacheKey = buildFragmentCacheKey(id, lang)
    await store.writeMany([{ cacheKey, entry }])
  }

  const refreshFragment = async (id: string, lang: FragmentLang = defaultFragmentLang): Promise<StoredFragment> => {
    const cacheKey = buildFragmentCacheKey(id, lang)
    const existing = inflight.get(cacheKey)
    if (existing !== undefined) return existing

    const task = (async () => {
      let lockToken: string | null = null
      try {
        lockToken = await store.acquireLock(id, lang, lockWaitMs)
        if (lockToken === null) {
          const cached = await waitForCachedFragment(id, lang, Date.now() + lockWaitMs)
          if (cached !== null) return cached
          lockToken = await store.acquireLock(id, lang, lockWaitMs)
        }
        const entry = await renderDefinition(id, lang)
        await writeFragment(id, lang, entry)
        return entry
      } catch (error) {
        const cached = await readFragment(id, lang)
        if (cached !== null) return cached

        const translate = (createTranslatorOption ?? createFragmentTranslator)(lang)
        const context: FragmentRenderContext = { lang, t: translate }
        const fallback: FragmentDefinition = {
          id,
          ttl: 5,
          staleTtl: 10,
          tags: ['error'],
          runtime: 'node' as const,
          head: [],
          css: '',
          render: ({ t }) =>
            h('section', null, [
              h('div', { class: 'meta-line' }, [textNode(t('render error'))]),
              h('h2', null, textNode(t('Fragment failed to render'))),
              h(
                'p',
                null,
                textNode(t('Last error: {{error}}', { error: error instanceof Error ? error.message : 'unknown' }))
              )
            ])
        }
        return renderDefinitionFromContext(fallback, context)
      } finally {
        if (lockToken !== null) {
          void store.releaseLock(id, lang, lockToken)
        }
        inflight.delete(cacheKey)
      }
    })()

    inflight.set(cacheKey, task)
    return task
  }

  const scheduleRefresh = (id: string, lang: FragmentLang) => {
    const cacheKey = buildFragmentCacheKey(id, lang)
    if (inflight.has(cacheKey) || nextRefreshAt.has(cacheKey)) {
      return
    }

    const delay = randomRefreshDelay()
    nextRefreshAt.set(cacheKey, Date.now() + delay)

    setTimeout(() => {
      nextRefreshAt.set(cacheKey, Date.now())
      void refreshFragment(id, lang).finally(() => {
        nextRefreshAt.delete(cacheKey)
      })
    }, delay)
  }

  const getOrRender = async (id: string, lang: FragmentLang): Promise<StoredFragment> => {
    const cached = await readFragment(id, lang)
    const now = Date.now()

    if (cached !== null) {
      if (now < cached.staleAt) {
        return cached
      }

      if (now < cached.expiresAt) {
        scheduleRefresh(id, lang)
        return cached
      }
    }

    return refreshFragment(id, lang)
  }

  const buildCacheStatus = (cached: StoredFragment | null, now: number): FragmentCacheStatus => {
    if (cached === null) {
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

  const annotatePlanEntry = async (
    entry: FragmentPlanEntry,
    now: number,
    lang: FragmentLang,
    cachedFragments: Map<string, StoredFragment | null>,
    options: FragmentPlanOptions
  ): Promise<FragmentPlanEntry> => {
    const definition = getFragmentDefinition(entry.id)
    const cacheKey = buildFragmentCacheKey(entry.id, lang)
    const cached = cachedFragments.get(cacheKey) ?? null

    if (cached !== null && options.fragmentsByCacheKey !== undefined) {
      options.fragmentsByCacheKey.set(cacheKey, cached)
    }

    const cache = buildCacheStatus(cached, now)

    if (cache.status !== 'hit') {
      scheduleRefresh(entry.id, lang)
    }

    return {
      ...entry,
      runtime: definition?.runtime ?? 'node',
      cache
    }
  }

  const getFragmentPlan = async (
    path: string,
    lang: FragmentLang = defaultFragmentLang,
    options: FragmentPlanOptions = {}
  ): Promise<FragmentPlan> => {
    const normalizedPath = normalizePlanPath(path)
    const plan =
      options.basePlan ?? getPlanFromMemo(normalizedPath, lang) ?? buildAndMemoizePlan(normalizedPath, lang)
    if (options.basePlan !== undefined) {
      memoizePlan(normalizedPath, lang, plan)
    }
    const now = Date.now()
    const cacheKeys = plan.fragments.map((entry) => buildFragmentCacheKey(entry.id, lang))
    const cachedFragments = await store.readMany(cacheKeys)
    const fragments = await Promise.all(
      plan.fragments.map((entry) => annotatePlanEntry(entry, now, lang, cachedFragments, options))
    )
    return { ...plan, path: normalizedPath, fragments }
  }

  const getFragmentEntry = async (id: string, options: FragmentFetchOptions = {}) => {
    const lang = options.lang ?? defaultFragmentLang
    return options.refresh === true ? refreshFragment(id, lang) : getOrRender(id, lang)
  }

  const getFragmentPayload = async (id: string, options?: FragmentFetchOptions) =>
    (await getFragmentEntry(id, options)).payload
  const getFragmentHtml = async (id: string, options?: FragmentFetchOptions) =>
    (await getFragmentEntry(id, options)).html

  const streamFragmentsForPath = async (path: string, lang: FragmentLang = defaultFragmentLang) => {
    const plan = await getFragmentPlan(path, lang)
    const encoder = new TextEncoder()
    const fetchGroups =
      plan.fetchGroups !== undefined && plan.fetchGroups.length > 0
        ? plan.fetchGroups
        : [plan.fragments.map((entry) => entry.id)]

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        for (const group of fetchGroups) {
          if (group.length === 0) continue
          const pending = new Map<string, Promise<Uint8Array>>()
          group.forEach((id) => {
            pending.set(id, getFragmentPayload(id, { lang }))
          })

          const raceEntries = async () => {
            const entries = Array.from(pending.entries()).map(([id, promise]) =>
              promise.then((payload) => ({ id, payload }))
            )
            return Promise.race(entries)
          }

          while (pending.size > 0) {
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

  return {
    getFragmentPlan,
    getFragmentEntry,
    getFragmentPayload,
    getFragmentHtml,
    streamFragmentsForPath,
    clearPlanMemo,
    getMemoizedPlan: (path: string, lang: FragmentLang = defaultFragmentLang) => getPlanFromMemo(path, lang),
    memoizeFragmentPlan: (path: string, lang: FragmentLang, plan: FragmentPlan) => memoizePlan(path, lang, plan)
  }
}
