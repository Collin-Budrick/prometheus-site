import { $, component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { getFragmentTextCopy, getReactBinaryDemoCopy } from '../lang/client'
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
const domNodes = ['<section>', '<h2>', '<p>', '<div.badge>']

export const ReactBinaryDemo = component$(() => {
  const langSignal = useLangSignal()
  const copy = getReactBinaryDemoCopy(langSignal.value)
  const fragmentText = getFragmentTextCopy(langSignal.value)
  const stageIndex = useSignal(0)
  const stage = copy.stages[stageIndex.value]
  const binaryChunks = useSignal(initialChunks)

  const actionLabel = copy.actions[stage.id as keyof typeof copy.actions]
  const stageId = stage.id

  const handleClick = $((event: Event) => {
    const target = event.target as HTMLElement | null
    const button = target?.closest('button[data-action], button[data-stage-index]') as HTMLButtonElement | null
    if (!button) return

    const nextStageIndex = button.dataset.stageIndex
    if (typeof nextStageIndex === 'string') {
      const parsed = Number.parseInt(nextStageIndex, 10)
      if (Number.isFinite(parsed) && parsed >= 0 && parsed < copy.stages.length) {
        stageIndex.value = parsed
      }
      return
    }

    if (button.dataset.action === 'advance') {
      stageIndex.value = (stageIndex.value + 1) % copy.stages.length
    }
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
    <div class="react-binary-demo" data-stage={stage.id} onClick$={handleClick}>
      <div class="react-binary-header">
        <div class="react-binary-controls">
          <div class="react-binary-title">{copy.title}</div>
          <button class="react-binary-action" type="button" data-action="advance" data-stage={stageId}>
            {actionLabel}
          </button>
        </div>
        <div class="react-binary-status" data-stage={stageId} aria-live="polite">
          {stage.hint}
        </div>
      </div>
      <div class="react-binary-steps" role="tablist" aria-label={copy.ariaStages}>
        {copy.stages.map((item, index) => {
          const isActive = stageIndex.value === index
          const state = index < stageIndex.value ? 'done' : isActive ? 'active' : 'idle'
          const tabId = `react-binary-tab-${item.id}`
          const panelId = `react-binary-panel-${item.id}`
          return (
            <button
              key={item.id}
              class="react-binary-step"
              data-step={item.id}
              type="button"
              id={tabId}
              role="tab"
              aria-selected={isActive}
              aria-controls={panelId}
              tabIndex={isActive ? 0 : -1}
              data-stage-index={String(index)}
              data-state={state}
            >
              <span class="react-binary-step-dot" aria-hidden="true" />
              {item.label}
            </button>
          )
        })}
      </div>
      <div class="react-binary-track">
        <div
          class="react-binary-panel"
          data-panel="react"
          data-state={stageId === 'react' ? 'active' : stageIndex.value > 0 ? 'done' : 'idle'}
          id="react-binary-panel-react"
          role="tabpanel"
          aria-labelledby="react-binary-tab-react"
        >
          <div class="react-binary-panel-title">{copy.panels.reactTitle}</div>
          <div class="react-binary-node-tree">
            {reactNodes.map((node, index) => (
              <div
                key={node}
                class={{ 'react-binary-node': true, 'is-child': index > 0 }}
                data-node-index={String(index)}
                data-state={stageId === 'react' ? (index === 0 ? 'active' : 'ready') : 'idle'}
              >
                {fragmentText[node] ?? node}
              </div>
            ))}
          </div>
          <div class="react-binary-caption">{copy.panels.reactCaption}</div>
        </div>
        <div
          class="react-binary-connector"
          data-connector="react-binary"
          data-state={stageId === 'binary' || stageId === 'qwik' ? 'active' : 'idle'}
          aria-hidden="true"
        />
        <div
          class="react-binary-panel"
          data-panel="binary"
          data-state={stageId === 'binary' ? 'active' : stageId === 'qwik' ? 'done' : 'idle'}
          id="react-binary-panel-binary"
          role="tabpanel"
          aria-labelledby="react-binary-tab-binary"
        >
          <div class="react-binary-panel-title">{copy.panels.binaryTitle}</div>
          <div class="react-binary-bits" role="group" aria-label={copy.footer.binaryStream}>
            {binaryChunks.value.map((chunk, index) => (
              <span
                key={`${index}:${chunk}`}
                class="react-binary-bit"
                data-bit-index={String(index)}
                data-anim={stageId === 'binary' ? 'true' : 'false'}
                data-state={stageId === 'binary' ? 'active' : stageId === 'qwik' ? 'ready' : 'idle'}
                style={{ '--react-binary-bit-delay': `${index * 65}ms` }}
              >
                {chunk}
              </span>
            ))}
          </div>
          <div class="react-binary-caption">{copy.panels.binaryCaption}</div>
        </div>
        <div
          class="react-binary-connector"
          data-connector="binary-qwik"
          data-state={stageId === 'qwik' ? 'active' : 'idle'}
          aria-hidden="true"
        />
        <div
          class="react-binary-panel"
          data-panel="qwik"
          data-state={stageId === 'qwik' ? 'active' : 'idle'}
          id="react-binary-panel-qwik"
          role="tabpanel"
          aria-labelledby="react-binary-tab-qwik"
        >
          <div class="react-binary-panel-title">{copy.panels.qwikTitle}</div>
          <div class="react-binary-dom">
            {domNodes.map((node, index) => (
              <span
                key={node}
                class="react-binary-dom-token"
                data-dom-index={String(index)}
                data-state={stageId === 'qwik' ? 'active' : stageId === 'binary' ? 'ready' : 'idle'}
                style={{ '--react-binary-dom-delay': `${index * 70}ms` }}
              >
                {node}
              </span>
            ))}
          </div>
          <div class="react-binary-caption">{copy.panels.qwikCaption}</div>
        </div>
      </div>
      <div class="react-binary-footer">
        <span class="react-binary-chip" data-state={stageId === 'react' ? 'active' : 'idle'}>
          {copy.footer.hydrationSkipped}
        </span>
        <span class="react-binary-chip" data-state={stageId === 'binary' || stageId === 'qwik' ? 'active' : 'idle'}>
          {copy.footer.binaryStream}
        </span>
      </div>
    </div>
  )
})
