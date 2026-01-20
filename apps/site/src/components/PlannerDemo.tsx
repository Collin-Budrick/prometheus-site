import { $, component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { getLanguagePack } from '../lang'
import { useLangSignal } from '../shared/lang-bridge'

const randomCache = (fragments: ReadonlyArray<{ id: string }>) =>
  Object.fromEntries(fragments.map((fragment) => [fragment.id, Math.random() > 0.45])) as Record<string, boolean>

const STAGE_COOKIE = 'planner-demo-stage'
const CACHE_COOKIE = 'planner-demo-cache'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30

const setCookie = (name: string, value: string) => {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`
}

const readCookieValue = (cookieHeader: string | null, name: string) => {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) {
      const raw = rest.join('=')
      if (!raw) return ''
      try {
        return decodeURIComponent(raw)
      } catch {
        return null
      }
    }
  }
  return null
}

const resolveStageIndex = (cookieHeader: string | null) => {
  const raw = readCookieValue(cookieHeader, STAGE_COOKIE)
  if (!raw) return -1
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : -1
}

const resolveCacheState = (cookieHeader: string | null, fragments: ReadonlyArray<{ id: string }>) => {
  const raw = readCookieValue(cookieHeader, CACHE_COOKIE)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, boolean>
    const hydrated: Record<string, boolean> = {}
    let hasData = false
    for (const fragment of fragments) {
      if (typeof parsed?.[fragment.id] === 'boolean') {
        hydrated[fragment.id] = parsed[fragment.id]
        hasData = true
      }
    }
    return hasData ? hydrated : null
  } catch (error) {
    return null
  }
}

export const PlannerDemo = component$(() => {
  const langSignal = useLangSignal()
  const copy = getLanguagePack(langSignal.value).demos.planner
  const steps = copy.steps
  const fragments = copy.fragments
  const cookieHeader = typeof document === 'undefined' ? null : document.cookie
  const initialStageIndex = resolveStageIndex(cookieHeader)
  const initialCacheState = resolveCacheState(cookieHeader, fragments)
  const stageIndex = useSignal(initialStageIndex)
  const isRunning = useSignal(false)
  const seedCacheState = initialCacheState ?? randomCache(fragments)
  const cacheState = useSignal<Record<string, boolean>>(seedCacheState)

  useVisibleTask$(() => {
    const browserCookies = document.cookie || null
    if (!browserCookies) return
    const nextStageIndex = resolveStageIndex(browserCookies)
    if (nextStageIndex >= 0 && stageIndex.value < 0) {
      stageIndex.value = nextStageIndex
    }
    const nextCacheState = resolveCacheState(browserCookies, fragments)
    if (nextCacheState && cacheState.value === seedCacheState) {
      cacheState.value = nextCacheState
    }
  })

  const runPlanner = $(async () => {
    if (isRunning.value) return
    isRunning.value = true
    for (let i = 0; i < steps.length; i += 1) {
      stageIndex.value = i
      setCookie(STAGE_COOKIE, String(i))
      await new Promise((resolve) => window.setTimeout(resolve, 720))
    }
    isRunning.value = false
  })

  const shuffleCache = $(() => {
    const nextCache = randomCache(fragments)
    cacheState.value = nextCache
    setCookie(CACHE_COOKIE, JSON.stringify(nextCache))
  })

  const toggleCache = $((id: string) => {
    const nextCache = { ...cacheState.value, [id]: !cacheState.value[id] }
    cacheState.value = nextCache
    setCookie(CACHE_COOKIE, JSON.stringify(nextCache))
  })

  const stage = stageIndex.value >= 0 ? steps[stageIndex.value] : null
  const showCache = stageIndex.value >= 1
  const showRuntime = stageIndex.value >= 2
  const showRender = stageIndex.value >= 3
  const showRevalidate = stageIndex.value >= 4

  return (
    <div class="planner-demo" data-stage={stage?.id ?? 'idle'}>
      <div class="planner-demo-header">
        <div class="planner-demo-title">{copy.title}</div>
        <div class="planner-demo-controls">
          <button class="planner-demo-action" type="button" onClick$={runPlanner} disabled={isRunning.value}>
            {isRunning.value ? copy.running : copy.run}
          </button>
          <button class="planner-demo-secondary" type="button" onClick$={shuffleCache}>
            {copy.shuffle}
          </button>
        </div>
      </div>
      <div class="planner-demo-status" aria-live="polite">
        {stage ? stage.hint : copy.waiting}
      </div>
      <div class="planner-demo-steps" role="list">
        {steps.map((step, index) => (
          <div
            key={step.id}
            class={{
              'planner-demo-step': true,
              'is-active': stageIndex.value === index,
              'is-done': stageIndex.value > index
            }}
            role="listitem"
          >
            <span class="planner-demo-step-dot" aria-hidden="true" />
            <span>{step.label}</span>
          </div>
        ))}
      </div>
      <div class="planner-demo-grid">
        {fragments.map((fragment) => {
          const cacheHit = cacheState.value[fragment.id]
          const renderState = showRender ? (cacheHit ? 'skip' : 'render') : 'idle'
          const revalidateState = showRevalidate ? (cacheHit ? 'queued' : 'fresh') : 'idle'
          return (
            <div
              key={fragment.id}
              class="planner-demo-card"
              data-cache={cacheHit ? 'hit' : 'miss'}
              data-render={renderState}
              data-revalidate={revalidateState}
            >
              <div class="planner-demo-card-header">
                <div class="planner-demo-card-title">{fragment.label}</div>
                <div class="planner-demo-card-meta">{fragment.id}</div>
              </div>
              <div class="planner-demo-row">
                <span class="planner-demo-label">{copy.labels.dependencies}</span>
                <span class="planner-demo-value">
                  {fragment.deps.length ? fragment.deps.join(' + ') : copy.root}
                </span>
                <span class="planner-demo-pill" data-state={stageIndex.value >= 0 ? 'ready' : 'idle'}>
                  {stageIndex.value >= 0 ? copy.resolved : copy.pending}
                </span>
              </div>
              <div class="planner-demo-row">
                <span class="planner-demo-label">{copy.labels.cache}</span>
                <button
                  class="planner-demo-toggle"
                  type="button"
                  data-state={cacheHit ? 'hit' : 'miss'}
                  onClick$={() => toggleCache(fragment.id)}
                >
                  {cacheHit ? copy.hit : copy.miss}
                </button>
                <span class="planner-demo-pill" data-state={showCache ? 'ready' : 'idle'}>
                  {showCache ? copy.checked : copy.waitingCache}
                </span>
              </div>
              <div class="planner-demo-row">
                <span class="planner-demo-label">{copy.labels.runtime}</span>
                <span class="planner-demo-pill" data-state={showRuntime ? 'ready' : 'idle'}>
                  {showRuntime ? fragment.runtime : copy.selecting}
                </span>
              </div>
              <div class="planner-demo-outcomes">
                <div class="planner-demo-outcome" data-state={renderState}>
                  {renderState === 'render'
                    ? copy.renderNow
                    : renderState === 'skip'
                      ? copy.skipRender
                      : copy.awaitRender}
                </div>
                <div class="planner-demo-outcome is-muted" data-state={revalidateState}>
                  {revalidateState === 'queued'
                    ? copy.revalidateQueued
                    : revalidateState === 'fresh'
                      ? copy.freshRender
                      : copy.awaitRevalidate}
                  <span class="planner-demo-spinner" aria-hidden="true" />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})
