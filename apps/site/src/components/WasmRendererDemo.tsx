import { $, component$, useSignal } from '@builder.io/qwik'
import { getLanguagePack } from '../lang'
import { useLangSignal } from '../shared/lang-bridge'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const computeMetrics = (a: number, b: number) => {
  const mixed = (a * 5 + b * 3) % 1024
  const throughput = 120 + (mixed % 280)
  const hotPath = 60 + (mixed % 40)
  const hash = ((mixed * 2654435761) >>> 0).toString(16).padStart(8, '0')
  return { mixed, throughput, hotPath, hash }
}

export const WasmRendererDemo = component$(() => {
  const langSignal = useLangSignal()
  const copy = getLanguagePack(langSignal.value).demos.wasmRenderer
  const inputA = useSignal(128)
  const inputB = useSignal(256)
  const initial = computeMetrics(inputA.value, inputB.value)
  const output = useSignal(initial.mixed)
  const throughput = useSignal(initial.throughput)
  const hotPath = useSignal(initial.hotPath)
  const hash = useSignal(initial.hash)
  const history = useSignal<number[]>([initial.mixed])
  const pulse = useSignal(false)

  const adjustAUp = $(() => {
    inputA.value = clamp(inputA.value + 16, 32, 512)
  })
  const adjustADown = $(() => {
    inputA.value = clamp(inputA.value - 16, 32, 512)
  })
  const adjustBUp = $(() => {
    inputB.value = clamp(inputB.value + 16, 32, 512)
  })
  const adjustBDown = $(() => {
    inputB.value = clamp(inputB.value - 16, 32, 512)
  })

  const runTransform = $(() => {
    const metrics = computeMetrics(inputA.value, inputB.value)
    output.value = metrics.mixed
    throughput.value = metrics.throughput
    hotPath.value = metrics.hotPath
    hash.value = metrics.hash
    history.value = [metrics.mixed, ...history.value].slice(0, 3)
    pulse.value = !pulse.value
  })

  const outputBits = output.value.toString(2).padStart(12, '0')
  const progress = Math.min(100, Math.max(0, hotPath.value))

  return (
    <div class="wasm-demo">
      <div class="wasm-demo-header">
        <div class="wasm-demo-title">{copy.title}</div>
        <button class="wasm-demo-action" type="button" onClick$={runTransform}>
          {copy.run}
        </button>
      </div>
      <div class="wasm-demo-subtitle">{copy.subtitle}</div>
      <div class="wasm-demo-grid">
        <div class="wasm-demo-panel" data-panel="inputs">
          <div class="wasm-demo-panel-title">{copy.panels.inputs}</div>
          <div class="wasm-demo-input">
            <span class="wasm-demo-label">A</span>
            <button class="wasm-demo-step" type="button" aria-label={copy.aria.decreaseA} onClick$={adjustADown}>
              -
            </button>
            <span class="wasm-demo-value">{inputA.value}</span>
            <button class="wasm-demo-step" type="button" aria-label={copy.aria.increaseA} onClick$={adjustAUp}>
              +
            </button>
          </div>
          <div class="wasm-demo-input">
            <span class="wasm-demo-label">B</span>
            <button class="wasm-demo-step" type="button" aria-label={copy.aria.decreaseB} onClick$={adjustBDown}>
              -
            </button>
            <span class="wasm-demo-value">{inputB.value}</span>
            <button class="wasm-demo-step" type="button" aria-label={copy.aria.increaseB} onClick$={adjustBUp}>
              +
            </button>
          </div>
          <div class="wasm-demo-note">{copy.notes.inputs}</div>
        </div>
        <div class="wasm-demo-panel" data-panel="wasm">
          <div class="wasm-demo-panel-title">{copy.panels.wasm}</div>
          <div class={{ 'wasm-demo-core': true, 'is-active': pulse.value }}>
            <div class="wasm-demo-core-value" aria-live="polite">
              {output.value}
            </div>
            <div class="wasm-demo-core-hash">hash {hash.value}</div>
          </div>
          <div class="wasm-demo-bits">{outputBits}</div>
          <div class="wasm-demo-note">{copy.notes.wasm}</div>
        </div>
        <div class="wasm-demo-panel" data-panel="fragment">
          <div class="wasm-demo-panel-title">{copy.panels.fragment}</div>
          <div class="wasm-demo-metrics">
            <div
              class="wasm-demo-metric"
              data-label={copy.metrics.burst}
              data-value={`${throughput.value} op/s`}
              aria-label={`${copy.metrics.burst} ${throughput.value} op/s`}
              role="group"
            >
            </div>
            <div
              class="wasm-demo-metric"
              data-label={copy.metrics.hotPath}
              data-value={`${hotPath.value} pts`}
              aria-label={`${copy.metrics.hotPath} ${hotPath.value} pts`}
              role="group"
            >
            </div>
          </div>
          <div class="wasm-demo-bar">
            <div class="wasm-demo-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <div class="wasm-demo-history">
            {history.value.map((value, index) => (
              <span key={`${value}-${index}`}>{value}</span>
            ))}
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
})
