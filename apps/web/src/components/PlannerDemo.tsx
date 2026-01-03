import { $, component$, useSignal } from '@builder.io/qwik'
import { useLangSignal } from '../shared/lang-bridge'

const plannerCopy = {
  en: {
    title: 'Planner simulation',
    run: 'Run plan',
    running: 'Running...',
    shuffle: 'Shuffle cache',
    waiting: 'Waiting on planner execution.',
    steps: [
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
    ],
    fragments: [
      { id: 'hero', label: 'Hero shell', deps: [], runtime: 'edge' },
      { id: 'planner', label: 'Planner core', deps: ['hero'], runtime: 'edge' },
      { id: 'ledger', label: 'Ledger stream', deps: ['planner'], runtime: 'node' },
      { id: 'react', label: 'React authoring', deps: ['planner'], runtime: 'node' }
    ],
    labels: {
      dependencies: 'Dependencies',
      cache: 'Cache',
      runtime: 'Runtime'
    },
    root: 'root',
    resolved: 'Resolved',
    pending: 'Pending',
    hit: 'Hit',
    miss: 'Miss',
    checked: 'Checked',
    waitingCache: 'Waiting',
    selecting: 'Selecting',
    renderNow: 'Render now',
    skipRender: 'Skip render',
    awaitRender: 'Await render',
    revalidateQueued: 'Revalidate queued',
    freshRender: 'Fresh render',
    awaitRevalidate: 'Await revalidate'
  },
  ko: {
    title: '\ud50c\ub798\ub108 \uc2dc\ubbac\ub808\uc774\uc158',
    run: '\ud50c\ub79c \uc2e4\ud589',
    running: '\uc2e4\ud589 \uc911...',
    shuffle: '\uce90\uc2dc \uc11e\uae30',
    waiting: '\ud50c\ub798\ub108 \uc2e4\ud589\uc744 \uae30\ub2e4\ub9ac\ub294 \uc911\uc785\ub2c8\ub2e4.',
    steps: [
      {
        id: 'deps',
        label: '\uc758\uc874\uc131 \ud574\uc11d',
        hint: '\uc758\uc874\uc131 \uadf8\ub798\ud504\ub97c \uba3c\uc800 \ud574\uacb0\ud569\ub2c8\ub2e4.'
      },
      {
        id: 'cache',
        label: '\uce90\uc2dc \ud655\uc778',
        hint: '\ub80c\ub354\ub9c1 \uc804\uc5d0 \uce90\uc2dc \ud788\ud2b8 \ub9f5\uc744 \uad6c\uc131\ud569\ub2c8\ub2e4.'
      },
      {
        id: 'runtime',
        label: '\ub7f0\ud0c0\uc784 \uc120\ud0dd',
        hint: 'Edge/Node \ub300\uc0c1\uc774 \ud655\uc815\ub429\ub2c8\ub2e4.'
      },
      {
        id: 'render',
        label: '\ubbf8\uc2a4 \ub80c\ub354',
        hint: '\uce90\uc2dc \ubbf8\uc2a4\ub9cc \ub80c\ub354\ub9c1\ud569\ub2c8\ub2e4.'
      },
      {
        id: 'revalidate',
        label: '\ube44\ub3d9\uae30 \uc7ac\uac80\uc99d',
        hint: '\uc7ac\uac80\uc99d\uc744 \ubc31\uadf8\ub77c\uc6b4\ub4dc\uc5d0 \ud050\uc789\ud569\ub2c8\ub2e4.'
      }
    ],
    fragments: [
      { id: 'hero', label: '\ud788\uc5b4\ub85c \uc178', deps: [], runtime: 'edge' },
      { id: 'planner', label: '\ud50c\ub798\ub108 \ucf54\uc5b4', deps: ['hero'], runtime: 'edge' },
      { id: 'ledger', label: '\ub808\uc800 \uc2a4\ud2b8\ub9bc', deps: ['planner'], runtime: 'node' },
      { id: 'react', label: 'React \uc791\uc131', deps: ['planner'], runtime: 'node' }
    ],
    labels: {
      dependencies: '\uc758\uc874\uc131',
      cache: '\uce90\uc2dc',
      runtime: '\ub7f0\ud0c0\uc784'
    },
    root: '\ub8e8\ud2b8',
    resolved: '\ud574\uacb0\ub428',
    pending: '\ub300\uae30',
    hit: '\ud788\ud2b8',
    miss: '\ubbf8\uc2a4',
    checked: '\ud655\uc778\ub428',
    waitingCache: '\ub300\uae30 \uc911',
    selecting: '\uc120\ud0dd \uc911',
    renderNow: '\uc9c0\uae08 \ub80c\ub354',
    skipRender: '\ub80c\ub354 \uac74\ub108\ub700',
    awaitRender: '\ub80c\ub354 \ub300\uae30',
    revalidateQueued: '\uc7ac\uac80\uc99d \ud050\uc789',
    freshRender: '\uc2e0\uaddc \ub80c\ub354',
    awaitRevalidate: '\uc7ac\uac80\uc99d \ub300\uae30'
  }
} as const

const randomCache = (fragments: Array<{ id: string }>) =>
  Object.fromEntries(fragments.map((fragment) => [fragment.id, Math.random() > 0.45])) as Record<string, boolean>

export const PlannerDemo = component$(() => {
  const langSignal = useLangSignal()
  const copy = plannerCopy[langSignal.value] ?? plannerCopy.en
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
