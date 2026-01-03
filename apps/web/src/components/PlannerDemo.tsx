import { $, component$, useSignal } from '@builder.io/qwik'

const steps = [
  {
    id: 'deps',
    label: 'Resolve deps',
    hint: 'Dependency graph resolved up front.'
  },
  {
    id: 'cache',
    label: 'Cache check',
    hint: 'Cache hit map built before rendering.'
  },
  {
    id: 'runtime',
    label: 'Select runtime',
    hint: 'Edge/Node targets locked in.'
  },
  {
    id: 'render',
    label: 'Render misses',
    hint: 'Only cache misses render.'
  },
  {
    id: 'revalidate',
    label: 'Async revalidate',
    hint: 'Revalidation queued in the background.'
  }
] as const

const fragments = [
  { id: 'hero', label: 'Hero shell', deps: [], runtime: 'edge' },
  { id: 'planner', label: 'Planner core', deps: ['hero'], runtime: 'edge' },
  { id: 'ledger', label: 'Ledger stream', deps: ['planner'], runtime: 'node' },
  { id: 'react', label: 'React authoring', deps: ['planner'], runtime: 'node' }
] as const

const randomCache = () =>
  Object.fromEntries(fragments.map((fragment) => [fragment.id, Math.random() > 0.45])) as Record<string, boolean>

export const PlannerDemo = component$(() => {
  const stageIndex = useSignal(-1)
  const isRunning = useSignal(false)
  const cacheState = useSignal<Record<string, boolean>>(randomCache())

  const runPlanner = $(async () => {
    if (isRunning.value) return
    isRunning.value = true
    for (let i = 0; i < steps.length; i += 1) {
      stageIndex.value = i
      await new Promise((resolve) => window.setTimeout(resolve, 720))
    }
    isRunning.value = false
  })

  const shuffleCache = $(() => {
    cacheState.value = randomCache()
  })

  const toggleCache = $((id: string) => {
    cacheState.value = { ...cacheState.value, [id]: !cacheState.value[id] }
  })

  const stage = stageIndex.value >= 0 ? steps[stageIndex.value] : null
  const showCache = stageIndex.value >= 1
  const showRuntime = stageIndex.value >= 2
  const showRender = stageIndex.value >= 3
  const showRevalidate = stageIndex.value >= 4

  return (
    <div class="planner-demo" data-stage={stage?.id ?? 'idle'}>
      <div class="planner-demo-header">
        <div class="planner-demo-title">Planner simulation</div>
        <div class="planner-demo-controls">
          <button class="planner-demo-action" type="button" onClick$={runPlanner} disabled={isRunning.value}>
            {isRunning.value ? 'Running…' : 'Run plan'}
          </button>
          <button class="planner-demo-secondary" type="button" onClick$={shuffleCache}>
            Shuffle cache
          </button>
        </div>
      </div>
      <div class="planner-demo-status" aria-live="polite">
        {stage ? stage.hint : 'Waiting on planner execution.'}
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
                <span class="planner-demo-label">Dependencies</span>
                <span class="planner-demo-value">
                  {fragment.deps.length ? fragment.deps.join(' + ') : 'root'}
                </span>
                <span class="planner-demo-pill" data-state={stageIndex.value >= 0 ? 'ready' : 'idle'}>
                  {stageIndex.value >= 0 ? 'Resolved' : 'Pending'}
                </span>
              </div>
              <div class="planner-demo-row">
                <span class="planner-demo-label">Cache</span>
                <button
                  class="planner-demo-toggle"
                  type="button"
                  data-state={cacheHit ? 'hit' : 'miss'}
                  onClick$={() => toggleCache(fragment.id)}
                >
                  {cacheHit ? 'Hit' : 'Miss'}
                </button>
                <span class="planner-demo-pill" data-state={showCache ? 'ready' : 'idle'}>
                  {showCache ? 'Checked' : 'Waiting'}
                </span>
              </div>
              <div class="planner-demo-row">
                <span class="planner-demo-label">Runtime</span>
                <span class="planner-demo-pill" data-state={showRuntime ? 'ready' : 'idle'}>
                  {showRuntime ? fragment.runtime : 'Selecting'}
                </span>
              </div>
              <div class="planner-demo-outcomes">
                <div class="planner-demo-outcome" data-state={renderState}>
                  {renderState === 'render'
                    ? 'Render now'
                    : renderState === 'skip'
                      ? 'Skip render'
                      : 'Await render'}
                </div>
                <div class="planner-demo-outcome is-muted" data-state={revalidateState}>
                  {revalidateState === 'queued'
                    ? 'Revalidate queued'
                    : revalidateState === 'fresh'
                      ? 'Fresh render'
                      : 'Await revalidate'}
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
