import { $, component$, useSignal } from '@builder.io/qwik'
import { getLanguagePack } from '../lang'
import { useLangSignal } from '../shared/lang-bridge'

const randomCache = (fragments: ReadonlyArray<{ id: string }>) =>
  Object.fromEntries(fragments.map((fragment) => [fragment.id, Math.random() > 0.45])) as Record<string, boolean>

export const PlannerDemo = component$(() => {
  const langSignal = useLangSignal()
  const copy = getLanguagePack(langSignal.value).demos.planner
  const steps = copy.steps
  const fragments = copy.fragments
  const stageIndex = useSignal(-1)
  const isRunning = useSignal(false)
  const cacheState = useSignal<Record<string, boolean>>(randomCache(fragments))

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
    cacheState.value = randomCache(fragments)
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
