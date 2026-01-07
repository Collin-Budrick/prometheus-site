import { $, component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { getLanguagePack } from '../lang'
import { useLangSignal } from '../shared/lang-bridge'

const randomBits = (length = 4) => {
  let bits = ''
  for (let i = 0; i < length; i += 1) {
    bits += Math.random() > 0.5 ? '1' : '0'
  }
  return bits
}

const reactNodes = ['Fragment', 'Card', 'Title', 'Copy', 'Badge']
const initialChunks = ['0101', '1100', '0011', '1010', '0110', '1001', '0001', '1110']
const domNodes = ['section', 'h2', 'p', 'div.badge']

export const ReactBinaryDemo = component$(() => {
  const langSignal = useLangSignal()
  const copy = getLanguagePack(langSignal.value).demos.reactBinary
  const stageIndex = useSignal(0)
  const stage = copy.stages[stageIndex.value]
  const binaryChunks = useSignal(initialChunks)

  const actionLabel = copy.actions[stage.id as keyof typeof copy.actions]

  const advance = $(() => {
    stageIndex.value = (stageIndex.value + 1) % copy.stages.length
  })

  useVisibleTask$((ctx) => {
    const active = ctx.track(() => copy.stages[stageIndex.value]?.id === 'binary')
    if (!active) return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    const update = () => {
      binaryChunks.value = binaryChunks.value.map((chunk) => randomBits(chunk.length))
    }

    let timeout: number | null = null

    const clear = () => {
      if (timeout !== null) {
        window.clearTimeout(timeout)
        timeout = null
      }
    }

    const schedule = () => {
      if (timeout !== null) return
      if (document.visibilityState !== 'visible') return
      timeout = window.setTimeout(() => {
        timeout = null
        update()
        schedule()
      }, 700)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        schedule()
      } else {
        clear()
      }
    }

    update()
    schedule()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    ctx.cleanup(() => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      clear()
    })
  })

  return (
    <div class="react-binary-demo" data-stage={stage.id}>
      <div class="react-binary-header">
        <div class="react-binary-controls">
          <div class="react-binary-title">{copy.title}</div>
          <button class="react-binary-action" type="button" onClick$={advance}>
            {actionLabel}
          </button>
        </div>
        <div class="react-binary-status" aria-live="polite">
          {stage.hint}
        </div>
      </div>
      <div class="react-binary-steps" role="tablist" aria-label={copy.ariaStages}>
        {copy.stages.map((item, index) => (
          <button
            key={item.id}
            class="react-binary-step"
            data-step={item.id}
            type="button"
            aria-pressed={stageIndex.value === index}
            onClick$={() => {
              stageIndex.value = index
            }}
          >
            <span class="react-binary-step-dot" aria-hidden="true" />
            {item.label}
          </button>
        ))}
      </div>
      <div class="react-binary-track">
        <div class="react-binary-panel" data-panel="react">
          <div class="react-binary-panel-title">{copy.panels.reactTitle}</div>
          <div class="react-binary-node-tree">
            {reactNodes.map((node, index) => (
              <div key={node} class={{ 'react-binary-node': true, 'is-child': index > 0 }}>
                {node}
              </div>
            ))}
          </div>
          <div class="react-binary-caption">{copy.panels.reactCaption}</div>
        </div>
        <div class="react-binary-connector" aria-hidden="true" />
        <div class="react-binary-panel" data-panel="binary">
          <div class="react-binary-panel-title">{copy.panels.binaryTitle}</div>
          <div class="react-binary-bits" role="group" aria-label={copy.footer.binaryStream}>
            {binaryChunks.value.map((chunk, index) => (
              <span key={`binary-${index}`} data-anim="true">
                {chunk}
              </span>
            ))}
          </div>
          <div class="react-binary-caption">{copy.panels.binaryCaption}</div>
        </div>
        <div class="react-binary-connector" aria-hidden="true" />
        <div class="react-binary-panel" data-panel="qwik">
          <div class="react-binary-panel-title">{copy.panels.qwikTitle}</div>
          <div class="react-binary-dom">
            {domNodes.map((node) => (
              <span key={node}>{`<${node}>`}</span>
            ))}
          </div>
          <div class="react-binary-caption">{copy.panels.qwikCaption}</div>
        </div>
      </div>
      <div class="react-binary-footer">
        <span class="react-binary-chip">{copy.footer.hydrationSkipped}</span>
        <span class="react-binary-chip">{copy.footer.binaryStream}</span>
      </div>
    </div>
  )
})
