import { component$, type QRL } from '@builder.io/qwik'
import type {
  PlannerDemoCopy,
  PreactIslandCopy,
  ReactBinaryDemoCopy,
  UiCopy,
  WasmRendererDemoCopy
} from '../lang'

export type HomeDemoKind = 'planner' | 'wasm-renderer' | 'react-binary' | 'preact-island'

type HomeDemoPreviewProps = {
  kind: HomeDemoKind
  ui: Pick<UiCopy, 'demoActivate' | 'demoActivating'>
  planner?: PlannerDemoCopy
  wasmRenderer?: WasmRendererDemoCopy
  reactBinary?: ReactBinaryDemoCopy
  preactIsland?: PreactIslandCopy
  activating: boolean
  onActivate$: QRL<() => void>
}

const renderPlannerPreview = (copy: PlannerDemoCopy, ui: Pick<UiCopy, 'demoActivate' | 'demoActivating'>, activating: boolean, onActivate$: QRL<() => void>) => (
  <div class="planner-demo planner-demo-preview" data-stage="idle" data-preview="true">
    <div class="planner-demo-header">
      <div class="planner-demo-title">{copy.title}</div>
      <div class="planner-demo-controls">
        <button class="planner-demo-action" type="button" onClick$={onActivate$} disabled={activating}>
          {activating ? ui.demoActivating : ui.demoActivate}
        </button>
        <button class="planner-demo-secondary" type="button" disabled>
          {copy.shuffle}
        </button>
      </div>
    </div>
    <div class="planner-demo-status" aria-live="polite">
      {copy.waiting}
    </div>
    <div class="planner-demo-steps" role="list">
      {copy.steps.map((step) => (
        <div key={step.id} class="planner-demo-step" role="listitem">
          {step.label}
        </div>
      ))}
    </div>
    <div class="planner-demo-grid">
      {copy.fragments.map((fragment) => (
        <div
          key={fragment.id}
          class="planner-demo-card"
          data-cache="hit"
          data-render="idle"
          data-revalidate="idle"
          data-title={fragment.label}
          data-meta={fragment.id}
        >
          <div
            class="planner-demo-row planner-demo-row--dependencies"
            data-label={copy.labels.dependencies}
            data-state="idle"
            data-pill={copy.pending}
          >
            {fragment.deps.length ? fragment.deps.join(' + ') : copy.root}
          </div>
          <div
            class="planner-demo-row planner-demo-row--cache"
            data-label={copy.labels.cache}
            data-state="idle"
            data-pill={copy.waitingCache}
          >
            <button class="planner-demo-toggle" type="button" data-state="hit" disabled>
              {copy.hit}
            </button>
          </div>
          <div
            class="planner-demo-row planner-demo-row--runtime"
            data-label={copy.labels.runtime}
            data-state="idle"
            data-pill={copy.selecting}
          >
            {copy.selecting}
          </div>
          <div class="planner-demo-outcome" data-state="idle">
            {copy.awaitRender}
          </div>
          <div class="planner-demo-outcome is-muted" data-state="idle">
            {copy.awaitRevalidate}
          </div>
        </div>
      ))}
    </div>
  </div>
)

const renderWasmPreview = (copy: WasmRendererDemoCopy, ui: Pick<UiCopy, 'demoActivate' | 'demoActivating'>, activating: boolean, onActivate$: QRL<() => void>) => (
  <div class="wasm-demo" data-preview="true">
    <div class="wasm-demo-header">
      <div class="wasm-demo-title">{copy.title}</div>
      <button class="wasm-demo-action" type="button" onClick$={onActivate$} disabled={activating}>
        {activating ? ui.demoActivating : ui.demoActivate}
      </button>
    </div>
    <div class="wasm-demo-subtitle">{copy.subtitle}</div>
    <div class="wasm-demo-grid">
      <div class="wasm-demo-panel" data-panel="inputs">
        <div class="wasm-demo-panel-title">{copy.panels.inputs}</div>
        <div class="wasm-demo-input">
          <span class="wasm-demo-label">A</span>
          <button class="wasm-demo-step" type="button" aria-label={copy.aria.decreaseA} disabled>
            -
          </button>
          <span class="wasm-demo-value">128</span>
          <button class="wasm-demo-step" type="button" aria-label={copy.aria.increaseA} disabled>
            +
          </button>
        </div>
        <div class="wasm-demo-input">
          <span class="wasm-demo-label">B</span>
          <button class="wasm-demo-step" type="button" aria-label={copy.aria.decreaseB} disabled>
            -
          </button>
          <span class="wasm-demo-value">256</span>
          <button class="wasm-demo-step" type="button" aria-label={copy.aria.increaseB} disabled>
            +
          </button>
        </div>
        <div class="wasm-demo-note">{copy.notes.inputs}</div>
      </div>
      <div class="wasm-demo-panel" data-panel="wasm">
        <div class="wasm-demo-panel-title">{copy.panels.wasm}</div>
        <div class="wasm-demo-core">
          <div class="wasm-demo-core-value" aria-live="polite">
            384
          </div>
          <div class="wasm-demo-core-hash">hash 53368980</div>
        </div>
        <div class="wasm-demo-bits">000110000000</div>
        <div class="wasm-demo-note">{copy.notes.wasm}</div>
      </div>
      <div class="wasm-demo-panel" data-panel="fragment">
        <div class="wasm-demo-panel-title">{copy.panels.fragment}</div>
        <div class="wasm-demo-metrics">
          <div
            class="wasm-demo-metric"
            data-label={copy.metrics.burst}
            data-value="224 op/s"
            aria-label={`${copy.metrics.burst} 224 op/s`}
            role="group"
          />
          <div
            class="wasm-demo-metric"
            data-label={copy.metrics.hotPath}
            data-value="84 pts"
            aria-label={`${copy.metrics.hotPath} 84 pts`}
            role="group"
          />
        </div>
        <div class="wasm-demo-bar">
          <div class="wasm-demo-bar-fill" style={{ width: '84%' }} />
        </div>
        <div class="wasm-demo-history">
          <span>384</span>
        </div>
        <div class="wasm-demo-note">{copy.notes.fragment}</div>
      </div>
    </div>
    <div class="wasm-demo-footer">
      <span class="wasm-demo-chip">{copy.footer.edgeSafe}</span>
      <span class="wasm-demo-chip">{copy.footer.deterministic}</span>
      <span class="wasm-demo-chip">{copy.footer.htmlUntouched}</span>
    </div>
  </div>
)

const renderReactBinaryPreview = (copy: ReactBinaryDemoCopy, ui: Pick<UiCopy, 'demoActivate' | 'demoActivating'>, activating: boolean, onActivate$: QRL<() => void>) => {
  const stage = copy.stages[0]
  return (
    <div class="react-binary-demo" data-stage={stage.id} data-preview="true">
      <div class="react-binary-header">
        <div class="react-binary-controls">
          <div class="react-binary-title">{copy.title}</div>
          <button class="react-binary-action" type="button" onClick$={onActivate$} disabled={activating}>
            {activating ? ui.demoActivating : ui.demoActivate}
          </button>
        </div>
        <div class="react-binary-status" aria-live="polite">
          {stage.hint}
        </div>
      </div>
      <div class="react-binary-steps" role="tablist" aria-label={copy.ariaStages}>
        {copy.stages.map((item, index) => {
          const isActive = index === 0
          return (
            <button
              key={item.id}
              class="react-binary-step"
              data-step={item.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              disabled
            >
              <span class="react-binary-step-dot" aria-hidden="true" />
              {item.label}
            </button>
          )
        })}
      </div>
      <div class="react-binary-track">
        <div class="react-binary-panel" data-panel="react" data-state="active">
          <div class="react-binary-panel-title">{copy.panels.reactTitle}</div>
          <div class="react-binary-node-tree">
            <div class="react-binary-node" data-node-index="0" data-state="active">Fragment</div>
            <div class="react-binary-node is-child" data-node-index="1" data-state="ready">Card</div>
            <div class="react-binary-node is-child" data-node-index="2" data-state="ready">Title</div>
            <div class="react-binary-node is-child" data-node-index="3" data-state="ready">Copy</div>
            <div class="react-binary-node is-child" data-node-index="4" data-state="ready">Badge</div>
          </div>
          <div class="react-binary-caption">{copy.panels.reactCaption}</div>
        </div>
        <div class="react-binary-connector" data-connector="react-binary" data-state="idle" aria-hidden="true" />
        <div class="react-binary-panel" data-panel="binary" data-state="idle">
          <div class="react-binary-panel-title">{copy.panels.binaryTitle}</div>
          <div class="react-binary-bits" role="group" aria-label={copy.footer.binaryStream}>
            <span class="react-binary-bit" data-bit-index="0" data-anim="false" data-state="idle">0101</span>
            <span class="react-binary-bit" data-bit-index="1" data-anim="false" data-state="idle">1100</span>
            <span class="react-binary-bit" data-bit-index="2" data-anim="false" data-state="idle">0011</span>
            <span class="react-binary-bit" data-bit-index="3" data-anim="false" data-state="idle">1010</span>
            <span class="react-binary-bit" data-bit-index="4" data-anim="false" data-state="idle">0110</span>
            <span class="react-binary-bit" data-bit-index="5" data-anim="false" data-state="idle">1001</span>
            <span class="react-binary-bit" data-bit-index="6" data-anim="false" data-state="idle">0001</span>
            <span class="react-binary-bit" data-bit-index="7" data-anim="false" data-state="idle">1110</span>
          </div>
          <div class="react-binary-caption">{copy.panels.binaryCaption}</div>
        </div>
        <div class="react-binary-connector" data-connector="binary-qwik" data-state="idle" aria-hidden="true" />
        <div class="react-binary-panel" data-panel="qwik" data-state="idle">
          <div class="react-binary-panel-title">{copy.panels.qwikTitle}</div>
          <div class="react-binary-dom">
            <span class="react-binary-dom-token" data-dom-index="0" data-state="idle">{'<section>'}</span>
            <span class="react-binary-dom-token" data-dom-index="1" data-state="idle">{'<h2>'}</span>
            <span class="react-binary-dom-token" data-dom-index="2" data-state="idle">{'<p>'}</span>
            <span class="react-binary-dom-token" data-dom-index="3" data-state="idle">{'<div.badge>'}</span>
          </div>
          <div class="react-binary-caption">{copy.panels.qwikCaption}</div>
        </div>
      </div>
      <div class="react-binary-footer">
        <span class="react-binary-chip" data-state="active">{copy.footer.hydrationSkipped}</span>
        <span class="react-binary-chip" data-state="idle">{copy.footer.binaryStream}</span>
      </div>
    </div>
  )
}

const renderPreactIslandPreview = (copy: PreactIslandCopy, ui: Pick<UiCopy, 'demoActivate' | 'demoActivating'>, activating: boolean, onActivate$: QRL<() => void>) => (
  <div class="preact-island-ui" data-running="false" data-preview="true">
    <div class="preact-island-label">{copy.label}</div>
    <div class="preact-island-timer" aria-live="polite">
      1:00
    </div>
    <div class="preact-island-stage">
      <svg class="preact-island-dial" viewBox="0 0 120 120" aria-hidden="true">
        <circle class="preact-island-dial-track" cx="60" cy="60" r="48" />
        <circle class="preact-island-dial-ticks" cx="60" cy="60" r="48" />
        <circle
          class="preact-island-dial-progress"
          cx="60"
          cy="60"
          r="48"
          style={{ strokeDasharray: '302', strokeDashoffset: '0' }}
        />
        <line
          class="preact-island-dial-hand"
          x1="60"
          y1="60"
          x2="60"
          y2="16"
          style={{ transform: 'rotate(0deg)', transformOrigin: '60px 60px' }}
        />
        <circle class="preact-island-dial-center-dot" cx="60" cy="60" r="4" />
      </svg>
      <div class="preact-island-stage-title">{copy.countdown}</div>
      <div class="preact-island-stage-time" aria-live="polite">
        1:00
      </div>
      <div class="preact-island-stage-sub">{copy.activeSub}</div>
    </div>
    <button class="preact-island-action" type="button" onClick$={onActivate$} disabled={activating}>
      {activating ? ui.demoActivating : ui.demoActivate}
    </button>
  </div>
)

export const HomeDemoPreview = component$<HomeDemoPreviewProps>((props) => {
  switch (props.kind) {
    case 'planner':
      return renderPlannerPreview(props.planner!, props.ui, props.activating, props.onActivate$)
    case 'wasm-renderer':
      return renderWasmPreview(props.wasmRenderer!, props.ui, props.activating, props.onActivate$)
    case 'react-binary':
      return renderReactBinaryPreview(props.reactBinary!, props.ui, props.activating, props.onActivate$)
    case 'preact-island':
      return renderPreactIslandPreview(props.preactIsland!, props.ui, props.activating, props.onActivate$)
    default:
      return null
  }
})
