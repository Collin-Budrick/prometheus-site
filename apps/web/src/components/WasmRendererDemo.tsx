import { $, component$, useSignal } from '@builder.io/qwik'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const computeMetrics = (a: number, b: number) => {
  const mixed = (a * 5 + b * 3) % 1024
  const throughput = 120 + (mixed % 280)
  const hotPath = 60 + (mixed % 40)
  const hash = ((mixed * 2654435761) >>> 0).toString(16).padStart(8, '0')
  return { mixed, throughput, hotPath, hash }
}

export const WasmRendererDemo = component$(() => {
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
        <div class="wasm-demo-title">WASM transform demo</div>
        <button class="wasm-demo-action" type="button" onClick$={runTransform}>
          Run WASM
        </button>
      </div>
      <div class="wasm-demo-subtitle">
        Deterministic WebAssembly outputs drive fragment composition without touching HTML.
      </div>
      <div class="wasm-demo-grid">
        <div class="wasm-demo-panel" data-panel="inputs">
          <div class="wasm-demo-panel-title">Inputs</div>
          <div class="wasm-demo-input">
            <span class="wasm-demo-label">A</span>
            <button class="wasm-demo-step" type="button" aria-label="Decrease A" onClick$={adjustADown}>
              -
            </button>
            <span class="wasm-demo-value">{inputA.value}</span>
            <button class="wasm-demo-step" type="button" aria-label="Increase A" onClick$={adjustAUp}>
              +
            </button>
          </div>
          <div class="wasm-demo-input">
            <span class="wasm-demo-label">B</span>
            <button class="wasm-demo-step" type="button" aria-label="Decrease B" onClick$={adjustBDown}>
              -
            </button>
            <span class="wasm-demo-value">{inputB.value}</span>
            <button class="wasm-demo-step" type="button" aria-label="Increase B" onClick$={adjustBUp}>
              +
            </button>
          </div>
          <div class="wasm-demo-note">Edge-safe numeric inputs.</div>
        </div>
        <div class="wasm-demo-panel" data-panel="wasm">
          <div class="wasm-demo-panel-title">WASM transform</div>
          <div class={{ 'wasm-demo-core': true, 'is-active': pulse.value }}>
            <div class="wasm-demo-core-value" aria-live="polite">
              {output.value}
            </div>
            <div class="wasm-demo-core-hash">hash {hash.value}</div>
          </div>
          <div class="wasm-demo-bits">{outputBits}</div>
          <div class="wasm-demo-note">Deterministic output for same inputs.</div>
        </div>
        <div class="wasm-demo-panel" data-panel="fragment">
          <div class="wasm-demo-panel-title">Fragment composition</div>
          <div class="wasm-demo-metrics">
            <div class="wasm-demo-metric">
              <span>Burst</span>
              <strong>{throughput.value} op/s</strong>
            </div>
            <div class="wasm-demo-metric">
              <span>Hot-path</span>
              <strong>{hotPath.value} pts</strong>
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
          <div class="wasm-demo-note">Outputs feed layout metrics, not HTML.</div>
        </div>
      </div>
      <div class="wasm-demo-footer">
        <span class="wasm-demo-chip">Edge-safe</span>
        <span class="wasm-demo-chip">Deterministic</span>
        <span class="wasm-demo-chip">HTML: untouched</span>
      </div>
    </div>
  )
})
