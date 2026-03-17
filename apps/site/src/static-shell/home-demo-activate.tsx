import type { Lang, PlannerDemoCopy, ReactBinaryDemoCopy, WasmRendererDemoCopy } from '../lang'
import { setTrustedInnerHtml } from '../security/client'
import {
  getStaticHomePlannerDemoCopy,
  getStaticHomePreactIslandDemoCopy,
  getStaticHomeReactBinaryDemoCopy,
  getStaticHomeWasmRendererDemoCopy,
  seedStaticHomeCopy
} from './home-copy-store'
import {
  readStaticHomeBootstrapData,
  resolveStaticHomeRouteSeed,
  type StaticHomeBootstrapDocument
} from './home-bootstrap-data'
import { normalizeStaticShellLang } from './lang-param'

export type HomeDemoKind = 'planner' | 'wasm-renderer' | 'react-binary' | 'preact-island'

type ActivateHomeDemoOptions = {
  root: Element
  kind: HomeDemoKind
  props: Record<string, unknown>
}

export type HomeDemoActivationResult = {
  cleanup: () => void
  setViewportActive?: (active: boolean) => void
}

const initialBinaryChunks = ['0101', '1100', '0011', '1010', '0110', '1001', '0001', '1110']
const plannerStepDelayMs = 720
const preactCountdownSeconds = 60
const reactNodeLabels = ['Fragment', 'Card', 'Title', 'Copy', 'Badge']
const reactDomPreview = '<section> <h2> <p> <div.badge>'
let didWarnMissingReactBinaryCopy = false

const scheduleHomeDemoEnhancement = (effect: () => void) => {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    effect()
    return () => undefined
  }

  const handle = window.requestAnimationFrame(() => {
    effect()
  })

  return () => {
    window.cancelAnimationFrame(handle)
  }
}

const getCurrentLang = (): Lang => {
  return normalizeStaticShellLang(document.documentElement.lang)
}

export const ensureStaticHomeDemoSeed = async (
  doc: StaticHomeBootstrapDocument | null = typeof document !== 'undefined' ? document : null
) => {
  const data = readStaticHomeBootstrapData({ doc })
  if (!data) return null
  const routeSeed = await resolveStaticHomeRouteSeed(data)
  seedStaticHomeCopy(data.lang, data.shellSeed, routeSeed)
  return {
    ...data,
    routeSeed
  }
}

const getRootElement = (root: Element) => {
  if (!(root instanceof HTMLElement)) {
    throw new Error('Home demo activation requires an element root')
  }
  return root
}

const createTextSpan = (className: string, value: string) => {
  const span = document.createElement('span')
  span.className = className
  span.textContent = value
  return span
}

const randomBits = (length = 4) => {
  let bits = ''
  for (let index = 0; index < length; index += 1) {
    bits += Math.random() > 0.5 ? '1' : '0'
  }
  return bits
}

const randomPlannerCache = (fragments: ReadonlyArray<{ id: string }>) =>
  Object.fromEntries(fragments.map((fragment) => [fragment.id, Math.random() > 0.45])) as Record<string, boolean>

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const computeWasmMetrics = (a: number, b: number) => {
  const mixed = (a * 5 + b * 3) % 1024
  const throughput = 120 + (mixed % 280)
  const hotPath = 60 + (mixed % 40)
  const hash = ((mixed * 2654435761) >>> 0).toString(16).padStart(8, '0')
  return { mixed, throughput, hotPath, hash }
}

const setButtonLabel = (button: HTMLButtonElement | null, label: string) => {
  if (!button) return
  button.textContent = label
}

const setReactStepLabel = (button: HTMLButtonElement, label: string) => {
  button.replaceChildren(createTextSpan('react-binary-step-dot', ''))
  const dot = button.querySelector('.react-binary-step-dot')
  if (dot) {
    dot.setAttribute('aria-hidden', 'true')
    dot.textContent = ''
  }
  button.append(document.createTextNode(label))
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const prepareActiveDemoRoot = (root: HTMLElement, className: string, html: string) => {
  root.className = className
  root.setAttribute('data-home-demo-active', 'true')
  root.removeAttribute('data-home-preview')
  setTrustedInnerHtml(root, html, 'server')
}

const hasPreparedActiveDemoMarkup = (root: HTMLElement, className: string) =>
  root.classList.contains(className) || Boolean(root.querySelector(`.${className}`))

const isHomeDemoRootInViewport = (root: HTMLElement) => {
  if (typeof root.getBoundingClientRect !== 'function') {
    return true
  }

  const rect = root.getBoundingClientRect()
  const viewportWidth =
    typeof window !== 'undefined' && typeof window.innerWidth === 'number'
      ? window.innerWidth
      : document.documentElement?.clientWidth ?? 0
  const viewportHeight =
    typeof window !== 'undefined' && typeof window.innerHeight === 'number'
      ? window.innerHeight
      : document.documentElement?.clientHeight ?? 0

  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return true
  }

  return rect.bottom > 0 && rect.right > 0 && rect.top < viewportHeight && rect.left < viewportWidth
}

const bindHomeDemoViewportPlayback = (
  root: HTMLElement,
  onViewportActiveChange: (active: boolean) => void
) => {
  let observer: IntersectionObserver | null = null
  const canObserveViewport = typeof IntersectionObserver === 'function'
  let viewportActive = canObserveViewport ? true : isHomeDemoRootInViewport(root)

  const setViewportActive = (active: boolean) => {
    if (viewportActive === active) return
    viewportActive = active
    onViewportActiveChange(active)
  }

  onViewportActiveChange(viewportActive)

  if (canObserveViewport) {
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.target !== root) return
          setViewportActive(entry.isIntersecting && (entry.intersectionRatio ?? 0) > 0)
        })
      },
      {
        root: null,
        rootMargin: '0px',
        threshold: 0
      }
    )
    observer.observe(root)
  }

  return {
    cleanup: () => {
      observer?.disconnect()
    },
    setViewportActive
  }
}

const warnMissingReactBinaryCopy = () => {
  if (didWarnMissingReactBinaryCopy) return
  didWarnMissingReactBinaryCopy = true
  console.warn('Static home react demo copy was missing at activation time; keeping compact preview intact.')
}

const renderPlannerDemoMarkup = (copy: PlannerDemoCopy) => `
  <div class="planner-demo-header">
    <div class="planner-demo-title"></div>
    <div class="planner-demo-controls">
      <button class="planner-demo-action" type="button"></button>
      <button class="planner-demo-secondary" type="button"></button>
    </div>
  </div>
  <div class="planner-demo-status" aria-live="polite"></div>
  <div class="planner-demo-steps" role="list">
    ${copy.steps.map(() => '<div class="planner-demo-step" role="listitem"></div>').join('')}
  </div>
  <div class="planner-demo-grid">
    ${copy.fragments
      .map(
        () => `
          <div class="planner-demo-card" data-cache="hit" data-render="idle" data-revalidate="idle">
            <div class="planner-demo-row planner-demo-row--dependencies" data-state="idle" data-pill=""></div>
            <div class="planner-demo-row planner-demo-row--cache" data-state="idle" data-pill="">
              <button class="planner-demo-toggle" type="button" data-state="hit"></button>
            </div>
            <div class="planner-demo-row planner-demo-row--runtime" data-state="idle" data-pill=""></div>
            <div class="planner-demo-outcome" data-state="idle"></div>
            <div class="planner-demo-outcome is-muted" data-state="idle"></div>
          </div>
        `
      )
      .join('')}
  </div>
`

const renderWasmRendererDemoMarkup = () => `
  <div class="wasm-demo-header">
    <div class="wasm-demo-title"></div>
    <button class="wasm-demo-action" type="button"></button>
  </div>
  <div class="wasm-demo-subtitle"></div>
  <div class="wasm-demo-grid">
    <div class="wasm-demo-panel" data-panel="inputs">
      <div class="wasm-demo-panel-title"></div>
      <div class="wasm-demo-input">
        <span class="wasm-demo-label">A</span>
        <button class="wasm-demo-step" type="button"></button>
        <span class="wasm-demo-value"></span>
        <button class="wasm-demo-step" type="button"></button>
      </div>
      <div class="wasm-demo-input">
        <span class="wasm-demo-label">B</span>
        <button class="wasm-demo-step" type="button"></button>
        <span class="wasm-demo-value"></span>
        <button class="wasm-demo-step" type="button"></button>
      </div>
      <div class="wasm-demo-note"></div>
    </div>
    <div class="wasm-demo-panel" data-panel="wasm">
      <div class="wasm-demo-panel-title"></div>
      <div class="wasm-demo-core">
        <div class="wasm-demo-core-value" aria-live="polite"></div>
        <div class="wasm-demo-core-hash"></div>
      </div>
      <div class="wasm-demo-bits"></div>
      <div class="wasm-demo-note"></div>
    </div>
    <div class="wasm-demo-panel" data-panel="fragment">
      <div class="wasm-demo-panel-title"></div>
      <div class="wasm-demo-metrics">
        <div class="wasm-demo-metric" role="group"></div>
        <div class="wasm-demo-metric" role="group"></div>
      </div>
      <div class="wasm-demo-bar">
        <div class="wasm-demo-bar-fill"></div>
      </div>
      <div class="wasm-demo-history"></div>
      <div class="wasm-demo-note"></div>
    </div>
  </div>
  <div class="wasm-demo-footer">
    <span class="wasm-demo-chip"></span>
    <span class="wasm-demo-chip"></span>
    <span class="wasm-demo-chip"></span>
  </div>
`

const renderReactBinaryDemoMarkup = (copy: ReactBinaryDemoCopy) => `
  <div class="react-binary-header">
    <div class="react-binary-controls">
      <div class="react-binary-title">${escapeHtml(copy.title)}</div>
      <button class="react-binary-action" type="button"></button>
    </div>
    <div class="react-binary-status" aria-live="polite"></div>
  </div>
  <div class="react-binary-steps" role="tablist" aria-label="${escapeHtml(copy.ariaStages)}">
    ${copy.stages
      .map(
        (_, index) =>
          `<button class="react-binary-step" type="button" role="tab" aria-selected="${
            index === 0 ? 'true' : 'false'
          }"></button>`
      )
      .join('')}
  </div>
  <div class="react-binary-track">
    <div class="react-binary-panel" data-panel="react">
      <div class="react-binary-panel-title"></div>
      <div class="react-binary-node-tree">
        <div class="react-binary-node"></div>
        <div class="react-binary-node is-child"></div>
        <div class="react-binary-node is-child"></div>
        <div class="react-binary-node is-child"></div>
        <div class="react-binary-node is-child"></div>
      </div>
      <div class="react-binary-caption"></div>
    </div>
    <div class="react-binary-connector" aria-hidden="true"></div>
    <div class="react-binary-panel" data-panel="binary">
      <div class="react-binary-panel-title"></div>
      <div class="react-binary-bits" role="group" aria-label="${escapeHtml(copy.footer.binaryStream)}">
        <span data-anim="false"></span>
      </div>
      <div class="react-binary-caption"></div>
    </div>
    <div class="react-binary-connector" aria-hidden="true"></div>
    <div class="react-binary-panel" data-panel="qwik">
      <div class="react-binary-panel-title"></div>
      <div class="react-binary-dom">
        <span></span>
      </div>
      <div class="react-binary-caption"></div>
    </div>
  </div>
  <div class="react-binary-footer">
    <span class="react-binary-chip"></span>
    <span class="react-binary-chip"></span>
  </div>
`

const renderPreactIslandDemoMarkup = () => `
  <div class="preact-island-label"></div>
  <div class="preact-island-timer" aria-live="polite"></div>
  <div class="preact-island-stage">
    <svg class="preact-island-dial" viewBox="0 0 120 120" aria-hidden="true">
      <circle class="preact-island-dial-track" cx="60" cy="60" r="48"></circle>
      <circle class="preact-island-dial-ticks" cx="60" cy="60" r="48"></circle>
      <circle class="preact-island-dial-progress" cx="60" cy="60" r="48"></circle>
      <line class="preact-island-dial-hand" x1="60" y1="60" x2="60" y2="16"></line>
      <circle class="preact-island-dial-center-dot" cx="60" cy="60" r="4"></circle>
    </svg>
    <div class="preact-island-stage-title"></div>
    <div class="preact-island-stage-time" aria-live="polite"></div>
    <div class="preact-island-stage-sub"></div>
  </div>
  <button class="preact-island-action" type="button"></button>
`

const activatePlannerDemo = (root: HTMLElement): HomeDemoActivationResult => {
  const copy = getStaticHomePlannerDemoCopy(getCurrentLang())
  if (!hasPreparedActiveDemoMarkup(root, 'planner-demo')) {
    prepareActiveDemoRoot(root, 'planner-demo', renderPlannerDemoMarkup(copy))
  }
  const title = root.querySelector<HTMLElement>('.planner-demo-title')
  const runButton = root.querySelector<HTMLButtonElement>('.planner-demo-action')
  const shuffleButton = root.querySelector<HTMLButtonElement>('.planner-demo-secondary')
  const status = root.querySelector<HTMLElement>('.planner-demo-status')
  const stepElements = Array.from(root.querySelectorAll<HTMLElement>('.planner-demo-step'))
  const cardElements = Array.from(root.querySelectorAll<HTMLElement>('.planner-demo-card'))
  let stageIndex = -1
  let isRunning = false
  let timeoutHandle = 0
  let disposed = false
  let cacheState = randomPlannerCache(copy.fragments)
  let viewportActive = true

  const stopTimer = () => {
    if (!timeoutHandle) return
    window.clearTimeout(timeoutHandle)
    timeoutHandle = 0
  }

  const scheduleSequenceStep = () => {
    if (disposed || timeoutHandle || !isRunning || !viewportActive || document.visibilityState !== 'visible') {
      return
    }
    timeoutHandle = window.setTimeout(() => {
      timeoutHandle = 0
      runSequence(stageIndex + 1)
    }, plannerStepDelayMs)
  }

  const showCache = () => stageIndex >= 1
  const showRuntime = () => stageIndex >= 2
  const showRender = () => stageIndex >= 3
  const showRevalidate = () => stageIndex >= 4

  const updateCard = (card: HTMLElement, fragment: PlannerDemoCopy['fragments'][number]) => {
    const cacheHit = cacheState[fragment.id] ?? false
    const renderState = showRender() ? (cacheHit ? 'skip' : 'render') : 'idle'
    const revalidateState = showRevalidate() ? (cacheHit ? 'queued' : 'fresh') : 'idle'
    const dependencyRow = card.querySelector<HTMLElement>('.planner-demo-row--dependencies')
    const cacheRow = card.querySelector<HTMLElement>('.planner-demo-row--cache')
    const runtimeRow = card.querySelector<HTMLElement>('.planner-demo-row--runtime')
    const outcomes = Array.from(card.querySelectorAll<HTMLElement>('.planner-demo-outcome'))
    const cacheButton = card.querySelector<HTMLButtonElement>('.planner-demo-toggle')
    const dependencyValue = fragment.deps.length ? fragment.deps.join(' + ') : copy.root
    const dependencyState = stageIndex >= 0 ? 'ready' : 'idle'
    const dependencyPill = dependencyState === 'ready' ? copy.resolved : copy.pending
    const cachePill = showCache() ? copy.checked : copy.waitingCache
    const runtimeState = showRuntime() ? 'ready' : 'idle'
    const runtimeValue = showRuntime() ? fragment.runtime : copy.selecting

    card.dataset.cache = cacheHit ? 'hit' : 'miss'
    card.dataset.render = renderState
    card.dataset.revalidate = revalidateState
    card.dataset.title = fragment.label
    card.dataset.meta = fragment.id

    if (dependencyRow) {
      dependencyRow.setAttribute('data-label', copy.labels.dependencies)
      dependencyRow.setAttribute('data-state', dependencyState)
      dependencyRow.setAttribute('data-pill', dependencyPill)
      dependencyRow.textContent = dependencyValue
    }

    if (cacheRow) {
      cacheRow.setAttribute('data-label', copy.labels.cache)
      cacheRow.setAttribute('data-state', showCache() ? 'ready' : 'idle')
      cacheRow.setAttribute('data-pill', cachePill)
    }

    if (cacheButton) {
      cacheButton.dataset.cacheId = fragment.id
      cacheButton.dataset.state = cacheHit ? 'hit' : 'miss'
      cacheButton.disabled = false
      cacheButton.textContent = cacheHit ? copy.hit : copy.miss
    }

    if (runtimeRow) {
      runtimeRow.setAttribute('data-label', copy.labels.runtime)
      runtimeRow.setAttribute('data-state', runtimeState)
      runtimeRow.setAttribute('data-pill', runtimeValue)
      runtimeRow.textContent = runtimeValue
    }

    if (outcomes[0]) {
      outcomes[0].dataset.state = renderState
      outcomes[0].textContent =
        renderState === 'render'
          ? copy.renderNow
          : renderState === 'skip'
            ? copy.skipRender
            : copy.awaitRender
    }

    if (outcomes[1]) {
      outcomes[1].dataset.state = revalidateState
      outcomes[1].textContent =
        revalidateState === 'queued'
          ? copy.revalidateQueued
          : revalidateState === 'fresh'
            ? copy.freshRender
            : copy.awaitRevalidate
    }
  }

  const update = () => {
    const stage = stageIndex >= 0 ? copy.steps[stageIndex] : null
    root.dataset.preview = 'false'
    root.dataset.stage = stage?.id ?? 'idle'
    if (title) {
      title.textContent = copy.title
    }

    if (runButton) {
      runButton.disabled = isRunning
      runButton.dataset.action = 'run'
      runButton.removeAttribute('data-demo-activate')
      runButton.textContent = isRunning ? copy.running : copy.run
    }

    if (shuffleButton) {
      shuffleButton.disabled = false
      shuffleButton.dataset.action = 'shuffle'
      shuffleButton.textContent = copy.shuffle
    }

    if (status) {
      status.textContent = stage ? stage.hint : copy.waiting
    }

    stepElements.forEach((element, index) => {
      element.classList.toggle('is-active', stageIndex === index)
      element.classList.toggle('is-done', stageIndex > index)
      element.textContent = copy.steps[index]?.label ?? ''
    })

    cardElements.forEach((card, index) => {
      const fragment = copy.fragments[index]
      if (!fragment) return
      updateCard(card, fragment)
    })
  }

  const runSequence = (nextIndex: number) => {
    if (disposed) return
    if (nextIndex >= copy.steps.length) {
      isRunning = false
      stopTimer()
      update()
      return
    }
    stageIndex = nextIndex
    update()
    scheduleSequenceStep()
  }

  const handleClick = (event: Event) => {
    const button = (event.target as HTMLElement | null)?.closest('button') as HTMLButtonElement | null
    if (!button || !root.contains(button)) return

    const cacheId = button.dataset.cacheId
    if (cacheId) {
      cacheState = { ...cacheState, [cacheId]: !cacheState[cacheId] }
      update()
      return
    }

    const action = button.dataset.action
    if (action === 'shuffle') {
      cacheState = randomPlannerCache(copy.fragments)
      update()
      return
    }

    if (action !== 'run' || isRunning) return
    isRunning = true
    runSequence(0)
    update()
  }

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      scheduleSequenceStep()
      return
    }
    stopTimer()
  }

  const viewportPlayback = bindHomeDemoViewportPlayback(root, (active) => {
    viewportActive = active
    if (!active) {
      stopTimer()
      return
    }
    scheduleSequenceStep()
  })

  root.addEventListener('click', handleClick)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  update()

  return {
    cleanup: () => {
      disposed = true
      stopTimer()
      viewportPlayback.cleanup()
      root.removeEventListener('click', handleClick)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    },
    setViewportActive: viewportPlayback.setViewportActive
  }
}

const activateWasmRendererDemo = (root: HTMLElement): HomeDemoActivationResult => {
  const copy = getStaticHomeWasmRendererDemoCopy(getCurrentLang())
  if (!hasPreparedActiveDemoMarkup(root, 'wasm-demo')) {
    prepareActiveDemoRoot(root, 'wasm-demo', renderWasmRendererDemoMarkup())
  }
  const title = root.querySelector<HTMLElement>('.wasm-demo-title')
  const actionButton = root.querySelector<HTMLButtonElement>('.wasm-demo-action')
  const subtitle = root.querySelector<HTMLElement>('.wasm-demo-subtitle')
  const panelTitles = Array.from(root.querySelectorAll<HTMLElement>('.wasm-demo-panel-title'))
  const valueElements = Array.from(root.querySelectorAll<HTMLElement>('.wasm-demo-value'))
  const stepButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.wasm-demo-step'))
  const noteElements = Array.from(root.querySelectorAll<HTMLElement>('.wasm-demo-note'))
  const metricElements = Array.from(root.querySelectorAll<HTMLElement>('.wasm-demo-metric'))
  const barFill = root.querySelector<HTMLElement>('.wasm-demo-bar-fill')
  const historyRoot = root.querySelector<HTMLElement>('.wasm-demo-history')
  const core = root.querySelector<HTMLElement>('.wasm-demo-core')
  const coreValue = root.querySelector<HTMLElement>('.wasm-demo-core-value')
  const coreHash = root.querySelector<HTMLElement>('.wasm-demo-core-hash')
  const bits = root.querySelector<HTMLElement>('.wasm-demo-bits')
  const footerChips = Array.from(root.querySelectorAll<HTMLElement>('.wasm-demo-chip'))
  let inputA = 128
  let inputB = 256
  let history = [computeWasmMetrics(inputA, inputB).mixed]
  let pulseTimer = 0

  const update = () => {
    const metrics = computeWasmMetrics(inputA, inputB)
    const progress = Math.min(100, Math.max(0, metrics.hotPath))

    root.dataset.preview = 'false'
    if (title) {
      title.textContent = copy.title
    }
    setButtonLabel(actionButton, copy.run)
    actionButton?.removeAttribute('data-demo-activate')
    actionButton?.setAttribute('data-action', 'run')
    if (actionButton) actionButton.disabled = false

    if (subtitle) subtitle.textContent = copy.subtitle
    panelTitles[0] && (panelTitles[0].textContent = copy.panels.inputs)
    panelTitles[1] && (panelTitles[1].textContent = copy.panels.wasm)
    panelTitles[2] && (panelTitles[2].textContent = copy.panels.fragment)

    if (valueElements[0]) valueElements[0].textContent = `${inputA}`
    if (valueElements[1]) valueElements[1].textContent = `${inputB}`

    if (stepButtons[0]) {
      stepButtons[0].disabled = false
      stepButtons[0].dataset.action = 'a-dec'
      stepButtons[0].setAttribute('aria-label', copy.aria.decreaseA)
      stepButtons[0].textContent = '-'
    }
    if (stepButtons[1]) {
      stepButtons[1].disabled = false
      stepButtons[1].dataset.action = 'a-inc'
      stepButtons[1].setAttribute('aria-label', copy.aria.increaseA)
      stepButtons[1].textContent = '+'
    }
    if (stepButtons[2]) {
      stepButtons[2].disabled = false
      stepButtons[2].dataset.action = 'b-dec'
      stepButtons[2].setAttribute('aria-label', copy.aria.decreaseB)
      stepButtons[2].textContent = '-'
    }
    if (stepButtons[3]) {
      stepButtons[3].disabled = false
      stepButtons[3].dataset.action = 'b-inc'
      stepButtons[3].setAttribute('aria-label', copy.aria.increaseB)
      stepButtons[3].textContent = '+'
    }

    if (coreValue) coreValue.textContent = `${metrics.mixed}`
    if (coreHash) coreHash.textContent = `hash ${metrics.hash}`
    if (bits) bits.textContent = metrics.mixed.toString(2).padStart(12, '0')

    noteElements[0] && (noteElements[0].textContent = copy.notes.inputs)
    noteElements[1] && (noteElements[1].textContent = copy.notes.wasm)
    noteElements[2] && (noteElements[2].textContent = copy.notes.fragment)

    if (metricElements[0]) {
      metricElements[0].dataset.label = copy.metrics.burst
      metricElements[0].dataset.value = `${metrics.throughput} op/s`
      metricElements[0].setAttribute('aria-label', `${copy.metrics.burst} ${metrics.throughput} op/s`)
    }
    if (metricElements[1]) {
      metricElements[1].dataset.label = copy.metrics.hotPath
      metricElements[1].dataset.value = `${metrics.hotPath} pts`
      metricElements[1].setAttribute('aria-label', `${copy.metrics.hotPath} ${metrics.hotPath} pts`)
    }

    if (barFill) {
      barFill.style.width = `${progress}%`
    }

    if (historyRoot) {
      historyRoot.replaceChildren(...history.map((value) => createTextSpan('', `${value}`)))
    }

    footerChips[0] && (footerChips[0].textContent = copy.footer.edgeSafe)
    footerChips[1] && (footerChips[1].textContent = copy.footer.deterministic)
    footerChips[2] && (footerChips[2].textContent = copy.footer.htmlUntouched)
  }

  const pulse = () => {
    core?.classList.add('is-active')
    if (pulseTimer) {
      window.clearTimeout(pulseTimer)
    }
    pulseTimer = window.setTimeout(() => {
      pulseTimer = 0
      core?.classList.remove('is-active')
    }, 320)
  }

  const handleClick = (event: Event) => {
    const button = (event.target as HTMLElement | null)?.closest('button') as HTMLButtonElement | null
    if (!button || !root.contains(button)) return

    switch (button.dataset.action) {
      case 'a-dec':
        inputA = clamp(inputA - 16, 32, 512)
        update()
        return
      case 'a-inc':
        inputA = clamp(inputA + 16, 32, 512)
        update()
        return
      case 'b-dec':
        inputB = clamp(inputB - 16, 32, 512)
        update()
        return
      case 'b-inc':
        inputB = clamp(inputB + 16, 32, 512)
        update()
        return
      case 'run': {
        const metrics = computeWasmMetrics(inputA, inputB)
        history = [metrics.mixed, ...history].slice(0, 3)
        update()
        pulse()
        return
      }
      default:
        return
    }
  }

  root.addEventListener('click', handleClick)
  update()

  return {
    cleanup: () => {
      if (pulseTimer) {
        window.clearTimeout(pulseTimer)
      }
      root.removeEventListener('click', handleClick)
    }
  }
}

const activateReactBinaryDemo = (root: HTMLElement): HomeDemoActivationResult => {
  const copy = getStaticHomeReactBinaryDemoCopy(getCurrentLang())
  if (copy.stages.length === 0) {
    warnMissingReactBinaryCopy()
    return {
      cleanup: () => undefined
    }
  }
  if (!hasPreparedActiveDemoMarkup(root, 'react-binary-demo')) {
    prepareActiveDemoRoot(root, 'react-binary-demo', renderReactBinaryDemoMarkup(copy))
  }
  const actionButton = root.querySelector<HTMLButtonElement>('.react-binary-action')
  const status = root.querySelector<HTMLElement>('.react-binary-status')
  const stepButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.react-binary-step'))
  const panelTitles = Array.from(root.querySelectorAll<HTMLElement>('.react-binary-panel-title'))
  const captions = Array.from(root.querySelectorAll<HTMLElement>('.react-binary-caption'))
  const footerChips = Array.from(root.querySelectorAll<HTMLElement>('.react-binary-chip'))
  const nodeElements = Array.from(root.querySelectorAll<HTMLElement>('.react-binary-node'))
  const bits = root.querySelector<HTMLElement>('.react-binary-bits span')
  const domPreview = root.querySelector<HTMLElement>('.react-binary-dom span')
  let stageIndex = 0
  let binaryChunks = [...initialBinaryChunks]
  let timeoutHandle = 0
  let viewportActive = true

  const stopTimer = () => {
    if (!timeoutHandle) return
    window.clearTimeout(timeoutHandle)
    timeoutHandle = 0
  }

  const updateBits = () => {
    binaryChunks = binaryChunks.map((chunk) => randomBits(chunk.length))
    if (bits) {
      bits.textContent = binaryChunks.join(' ')
    }
  }

  const schedule = () => {
    if (timeoutHandle) return
    if (document.visibilityState !== 'visible') return
    if (!viewportActive) return
    if (copy.stages[stageIndex]?.id !== 'binary') return
    timeoutHandle = window.setTimeout(() => {
      timeoutHandle = 0
      updateBits()
      schedule()
    }, 700)
  }

  const update = () => {
    const stage = copy.stages[stageIndex] ?? copy.stages[0]
    const actionLabel = copy.actions[stage.id as keyof typeof copy.actions] ?? copy.actions.react

    root.dataset.preview = 'false'
    root.dataset.stage = stage.id

    if (actionButton) {
      actionButton.disabled = false
      actionButton.dataset.action = 'advance'
      actionButton.removeAttribute('data-demo-activate')
      actionButton.textContent = actionLabel
    }

    if (status) {
      status.textContent = stage.hint
    }

    stepButtons.forEach((button, index) => {
      const step = copy.stages[index]
      if (!step) return
      button.disabled = false
      button.dataset.stageIndex = `${index}`
      button.setAttribute('aria-selected', index === stageIndex ? 'true' : 'false')
      button.tabIndex = index === stageIndex ? 0 : -1
      setReactStepLabel(button, step.label)
    })

    panelTitles[0] && (panelTitles[0].textContent = copy.panels.reactTitle)
    panelTitles[1] && (panelTitles[1].textContent = copy.panels.binaryTitle)
    panelTitles[2] && (panelTitles[2].textContent = copy.panels.qwikTitle)
    captions[0] && (captions[0].textContent = copy.panels.reactCaption)
    captions[1] && (captions[1].textContent = copy.panels.binaryCaption)
    captions[2] && (captions[2].textContent = copy.panels.qwikCaption)
    footerChips[0] && (footerChips[0].textContent = copy.footer.hydrationSkipped)
    footerChips[1] && (footerChips[1].textContent = copy.footer.binaryStream)
    nodeElements.forEach((element, index) => {
      element.textContent = reactNodeLabels[index] ?? ''
    })
    if (domPreview) {
      domPreview.textContent = reactDomPreview
    }

    if (bits) {
      bits.dataset.anim = stage.id === 'binary' ? 'true' : 'false'
      bits.textContent = binaryChunks.join(' ')
    }

    stopTimer()
    if (stage.id === 'binary') {
      updateBits()
      schedule()
    }
  }

  const handleClick = (event: Event) => {
    const button = (event.target as HTMLElement | null)?.closest('button') as HTMLButtonElement | null
    if (!button || !root.contains(button)) return

    if (button.dataset.action === 'advance') {
      stageIndex = (stageIndex + 1) % copy.stages.length
      update()
      return
    }

    if (typeof button.dataset.stageIndex === 'string') {
      const parsed = Number.parseInt(button.dataset.stageIndex, 10)
      if (Number.isFinite(parsed) && parsed >= 0 && parsed < copy.stages.length) {
        stageIndex = parsed
        update()
      }
    }
  }

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      schedule()
    } else {
      stopTimer()
    }
  }

  const viewportPlayback = bindHomeDemoViewportPlayback(root, (active) => {
    viewportActive = active
    if (!active) {
      stopTimer()
      return
    }
    schedule()
  })

  root.addEventListener('click', handleClick)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  update()

  return {
    cleanup: () => {
      stopTimer()
      viewportPlayback.cleanup()
      root.removeEventListener('click', handleClick)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    },
    setViewportActive: viewportPlayback.setViewportActive
  }
}

const activatePreactIslandDemo = (
  root: HTMLElement,
  props: Record<string, unknown>
): HomeDemoActivationResult => {
  const copy = getStaticHomePreactIslandDemoCopy(getCurrentLang())
  const label = typeof props.label === 'string' && props.label.trim() ? props.label : copy.label
  if (!hasPreparedActiveDemoMarkup(root, 'preact-island-ui')) {
    prepareActiveDemoRoot(root, 'preact-island-ui', renderPreactIslandDemoMarkup())
  }
  const labelElement = root.querySelector<HTMLElement>('.preact-island-label')
  const timer = root.querySelector<HTMLElement>('.preact-island-timer')
  const stageTitle = root.querySelector<HTMLElement>('.preact-island-stage-title')
  const stageTime = root.querySelector<HTMLElement>('.preact-island-stage-time')
  const stageSub = root.querySelector<HTMLElement>('.preact-island-stage-sub')
  const actionButton = root.querySelector<HTMLButtonElement>('.preact-island-action')
  const progressCircle = root.querySelector<SVGCircleElement>('.preact-island-dial-progress')
  const dialHand = root.querySelector<SVGLineElement>('.preact-island-dial-hand')
  let remaining = preactCountdownSeconds
  let timeoutHandle = 0
  let cancelDeferredTick: () => void = () => undefined
  let viewportActive = true

  const clearTick = () => {
    if (!timeoutHandle) return
    window.clearTimeout(timeoutHandle)
    timeoutHandle = 0
  }

  const scheduleTick = () => {
    if (timeoutHandle) return
    if (document.visibilityState !== 'visible') return
    if (!viewportActive) return
    if (remaining <= 0) return
    timeoutHandle = window.setTimeout(() => {
      timeoutHandle = 0
      remaining = Math.max(0, remaining - 1)
      update()
      scheduleTick()
    }, 1000)
  }

  const update = () => {
    const minutes = Math.floor(remaining / 60)
    const seconds = String(remaining % 60).padStart(2, '0')
    const progress = remaining / preactCountdownSeconds
    const circumference = Math.round(2 * Math.PI * 48)
    const offset = Math.round(circumference * (1 - progress))
    const rotation = Math.round((1 - progress) * -360)

    root.dataset.preview = 'false'
    root.dataset.running = remaining > 0 ? 'true' : 'false'
    labelElement && (labelElement.textContent = label)
    stageTitle && (stageTitle.textContent = copy.countdown)
    timer && (timer.textContent = remaining === 0 ? copy.ready : `${minutes}:${seconds}`)
    stageTime && (stageTime.textContent = remaining === 0 ? '0:00' : `${minutes}:${seconds}`)
    stageSub && (stageSub.textContent = remaining === 0 ? copy.readySub : copy.activeSub)

    if (actionButton) {
      actionButton.disabled = false
      actionButton.removeAttribute('data-demo-activate')
      actionButton.textContent = copy.reset
    }

    if (progressCircle) {
      progressCircle.style.strokeDasharray = `${circumference}`
      progressCircle.style.strokeDashoffset = `${offset}`
    }

    if (dialHand) {
      dialHand.style.transform = `rotate(${rotation}deg)`
      dialHand.style.transformOrigin = '60px 60px'
    }
  }

  const handleClick = (event: Event) => {
    const button = (event.target as HTMLElement | null)?.closest('button') as HTMLButtonElement | null
    if (!button || !root.contains(button)) return
    remaining = preactCountdownSeconds
    update()
    scheduleTick()
  }

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      scheduleTick()
    } else {
      clearTick()
    }
  }

  const viewportPlayback = bindHomeDemoViewportPlayback(root, (active) => {
    viewportActive = active
    if (!active) {
      clearTick()
      return
    }
    scheduleTick()
  })

  root.addEventListener('click', handleClick)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  update()
  cancelDeferredTick = scheduleHomeDemoEnhancement(() => {
    scheduleTick()
  })

  return {
    cleanup: () => {
      cancelDeferredTick()
      clearTick()
      viewportPlayback.cleanup()
      root.removeEventListener('click', handleClick)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    },
    setViewportActive: viewportPlayback.setViewportActive
  }
}

export const activatePlannerHomeDemo = async ({
  root
}: Pick<ActivateHomeDemoOptions, 'root' | 'props'>): Promise<HomeDemoActivationResult> => {
  await ensureStaticHomeDemoSeed()
  return activatePlannerDemo(getRootElement(root))
}

export const activateWasmRendererHomeDemo = async ({
  root
}: Pick<ActivateHomeDemoOptions, 'root' | 'props'>): Promise<HomeDemoActivationResult> => {
  await ensureStaticHomeDemoSeed()
  return activateWasmRendererDemo(getRootElement(root))
}

export const activateReactBinaryHomeDemo = async ({
  root
}: Pick<ActivateHomeDemoOptions, 'root' | 'props'>): Promise<HomeDemoActivationResult> => {
  await ensureStaticHomeDemoSeed()
  return activateReactBinaryDemo(getRootElement(root))
}

export const activatePreactIslandHomeDemo = async ({
  root,
  props
}: Pick<ActivateHomeDemoOptions, 'root' | 'props'>): Promise<HomeDemoActivationResult> => {
  await ensureStaticHomeDemoSeed()
  return activatePreactIslandDemo(getRootElement(root), props)
}

export const activateHomeDemo = async ({
  root,
  kind,
  props
}: ActivateHomeDemoOptions): Promise<HomeDemoActivationResult> => {
  switch (kind) {
    case 'planner':
      return activatePlannerHomeDemo({ root, props })
    case 'wasm-renderer':
      return activateWasmRendererHomeDemo({ root, props })
    case 'react-binary':
      return activateReactBinaryHomeDemo({ root, props })
    case 'preact-island':
      return activatePreactIslandHomeDemo({ root, props })
    default:
      throw new Error(`Unsupported home demo: ${kind satisfies never}`)
  }
}

export const resetHomeDemoActivationForTests = () => {
  didWarnMissingReactBinaryCopy = false
}
