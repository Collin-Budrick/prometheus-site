import type { Lang, PlannerDemoCopy, ReactBinaryDemoCopy, WasmRendererDemoCopy } from '../../lang'
import { requestNativeNotificationPermission } from '../../native/notifications'
import { setTrustedInnerHtml } from '../../security/client'
import {
  PREACT_COUNTDOWN_DEFAULT_SECONDS,
  PREACT_COUNTDOWN_NOTIFICATION_KEY,
  adjustPreactIslandCountdown,
  buildPreactIslandCompletionNotificationIntent,
  formatPreactIslandClock,
  resolvePreactIslandNotificationUrl,
  resolvePreactIslandProgress,
  resolvePreactIslandRemainingSeconds,
  resolvePreactIslandTickDelayMs
} from '../../shared/preact-island-countdown'
import { createResidentFragmentExecutionGate } from '../../shared/resident-fragment-execution-gate'
import {
  clearResidentNotificationIntent,
  emitResidentNotificationIntent
} from '../../shared/resident-notification-manager'
import {
  getStaticHomeFragmentTextCopy,
  getStaticHomePlannerDemoCopy,
  getStaticHomePreactIslandDemoCopy,
  getStaticHomeReactBinaryDemoCopy,
  getStaticHomeWasmRendererDemoCopy,
  seedStaticHomeCopy
} from './home-copy-store'
import {
  readStaticHomeBootstrapData,
  type StaticHomeBootstrapDocument
} from './home-bootstrap-data'
import { resolveStaticHomeRouteSeed } from './home-route-seed-resolver'
import { normalizeStaticShellLang } from '../core/lang-param'

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

type PreparedHomeDemoMarkup = Record<HomeDemoKind, string>

const initialBinaryChunks = ['0101', '1100', '0011', '1010', '0110', '1001', '0001', '1110']
const plannerStepDelayMs = 720
const reactNodeLabels = ['Fragment', 'Card', 'Title', 'Copy', 'Badge']
const reactDomPreviewTokens = ['<section>', '<h2>', '<p>', '<div.badge>']
let didWarnMissingReactBinaryCopy = false
let preparedHomeDemoMarkupCache: { lang: Lang; markup: PreparedHomeDemoMarkup } | null = null

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

const seedStaticHomeDemoCopyFromBootstrapData = (
  doc: StaticHomeBootstrapDocument | null = typeof document !== 'undefined' ? document : null
) => {
  const data = readStaticHomeBootstrapData({ doc })
  if (!data) {
    return false
  }

  seedStaticHomeCopy(data.lang, data.shellSeed, data.routeSeed)
  return true
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

const setStyleCustomProperty = (element: HTMLElement, name: string, value: string) => {
  const style = element.style as CSSStyleDeclaration | Record<string, string>
  if (typeof (style as CSSStyleDeclaration).setProperty === 'function') {
    ;(style as CSSStyleDeclaration).setProperty(name, value)
    return
  }
  ;(style as Record<string, string>)[name] = value
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

const getPreparedActiveDemoSurface = (root: HTMLElement, className: string) =>
  root.classList.contains(className) ? root : root.querySelector<HTMLElement>(`.${className}`) ?? root

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
    <div class="react-binary-panel" data-panel="react" data-state="active">
      <div class="react-binary-panel-title"></div>
      <div class="react-binary-node-tree">
        <div class="react-binary-node" data-node-index="0" data-state="active"></div>
        <div class="react-binary-node is-child" data-node-index="1" data-state="ready"></div>
        <div class="react-binary-node is-child" data-node-index="2" data-state="ready"></div>
        <div class="react-binary-node is-child" data-node-index="3" data-state="ready"></div>
        <div class="react-binary-node is-child" data-node-index="4" data-state="ready"></div>
      </div>
      <div class="react-binary-caption"></div>
    </div>
    <div class="react-binary-connector" data-connector="react-binary" data-state="idle" aria-hidden="true"></div>
    <div class="react-binary-panel" data-panel="binary" data-state="idle">
      <div class="react-binary-panel-title"></div>
      <div class="react-binary-bits" role="group" aria-label="${escapeHtml(copy.footer.binaryStream)}">
        ${initialBinaryChunks
          .map(
            (chunk, index) =>
              `<span class="react-binary-bit" data-bit-index="${index}" data-anim="false" data-state="idle">${chunk}</span>`
          )
          .join('')}
      </div>
      <div class="react-binary-caption"></div>
    </div>
    <div class="react-binary-connector" data-connector="binary-qwik" data-state="idle" aria-hidden="true"></div>
    <div class="react-binary-panel" data-panel="qwik" data-state="idle">
      <div class="react-binary-panel-title"></div>
      <div class="react-binary-dom">
        ${reactDomPreviewTokens
          .map(
            (token, index) =>
              `<span class="react-binary-dom-token" data-dom-index="${index}" data-state="idle">${escapeHtml(token)}</span>`
          )
          .join('')}
      </div>
      <div class="react-binary-caption"></div>
    </div>
  </div>
  <div class="react-binary-footer">
    <span class="react-binary-chip" data-state="active"></span>
    <span class="react-binary-chip" data-state="idle"></span>
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
  <div class="preact-island-controls">
    <button class="preact-island-adjust" data-adjust-seconds="-10" type="button">-10s</button>
    <button class="preact-island-adjust" data-adjust-seconds="10" type="button">+10s</button>
  </div>
  <button class="preact-island-action" type="button"></button>
`

const buildPreparedHomeDemoMarkup = (lang: Lang): PreparedHomeDemoMarkup => ({
  planner: renderPlannerDemoMarkup(getStaticHomePlannerDemoCopy(lang)),
  'wasm-renderer': renderWasmRendererDemoMarkup(),
  'react-binary': renderReactBinaryDemoMarkup(getStaticHomeReactBinaryDemoCopy(lang)),
  'preact-island': renderPreactIslandDemoMarkup()
})

const getPreparedHomeDemoMarkup = (kind: HomeDemoKind, lang = getCurrentLang()) => {
  if (!preparedHomeDemoMarkupCache || preparedHomeDemoMarkupCache.lang !== lang) {
    preparedHomeDemoMarkupCache = {
      lang,
      markup: buildPreparedHomeDemoMarkup(lang)
    }
  }

  return preparedHomeDemoMarkupCache.markup[kind]
}

export const prewarmHomeDemoActivationResources = async (
  doc: StaticHomeBootstrapDocument | null = typeof document !== 'undefined' ? document : null
) => {
  seedStaticHomeDemoCopyFromBootstrapData(doc)
  const data = await ensureStaticHomeDemoSeed(doc)
  const lang = data?.lang ?? getCurrentLang()
  getPreparedHomeDemoMarkup('planner', lang)
  getPreparedHomeDemoMarkup('wasm-renderer', lang)
  getPreparedHomeDemoMarkup('react-binary', lang)
  getPreparedHomeDemoMarkup('preact-island', lang)
  return data
}

const activatePlannerDemo = (root: HTMLElement): HomeDemoActivationResult => {
  const copy = getStaticHomePlannerDemoCopy(getCurrentLang())
  if (!hasPreparedActiveDemoMarkup(root, 'planner-demo')) {
    prepareActiveDemoRoot(root, 'planner-demo', getPreparedHomeDemoMarkup('planner'))
  }
  const surface = getPreparedActiveDemoSurface(root, 'planner-demo')
  const title = surface.querySelector<HTMLElement>('.planner-demo-title')
  const runButton = surface.querySelector<HTMLButtonElement>('.planner-demo-action')
  const shuffleButton = surface.querySelector<HTMLButtonElement>('.planner-demo-secondary')
  const status = surface.querySelector<HTMLElement>('.planner-demo-status')
  const stepElements = Array.from(surface.querySelectorAll<HTMLElement>('.planner-demo-step'))
  const cardElements = Array.from(surface.querySelectorAll<HTMLElement>('.planner-demo-card'))
  let stageIndex = -1
  let isRunning = false
  let timeoutHandle = 0
  let disposed = false
  let cacheState = randomPlannerCache(copy.fragments)
  const executionGate = createResidentFragmentExecutionGate({ root })

  const stopTimer = () => {
    if (!timeoutHandle) return
    window.clearTimeout(timeoutHandle)
    timeoutHandle = 0
  }

  const scheduleSequenceStep = () => {
    if (disposed || timeoutHandle || !isRunning || !executionGate.isActive()) {
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
    surface.dataset.preview = 'false'
    surface.dataset.stage = stage?.id ?? 'idle'
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
    if (!button || !surface.contains(button)) return

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

  const viewportPlayback = bindHomeDemoViewportPlayback(root, (active) => {
    executionGate.setViewportActive(active)
  })

  const unsubscribeExecution = executionGate.subscribe((isActive) => {
    if (!isActive) {
      stopTimer()
      return
    }
    scheduleSequenceStep()
  })

  surface.addEventListener('click', handleClick)
  update()

  return {
    cleanup: () => {
      disposed = true
      stopTimer()
      unsubscribeExecution()
      executionGate.destroy()
      viewportPlayback.cleanup()
      surface.removeEventListener('click', handleClick)
    },
    setViewportActive: viewportPlayback.setViewportActive
  }
}

const activateWasmRendererDemo = (root: HTMLElement): HomeDemoActivationResult => {
  const copy = getStaticHomeWasmRendererDemoCopy(getCurrentLang())
  if (!hasPreparedActiveDemoMarkup(root, 'wasm-demo')) {
    prepareActiveDemoRoot(root, 'wasm-demo', getPreparedHomeDemoMarkup('wasm-renderer'))
  }
  const surface = getPreparedActiveDemoSurface(root, 'wasm-demo')
  const title = surface.querySelector<HTMLElement>('.wasm-demo-title')
  const actionButton = surface.querySelector<HTMLButtonElement>('.wasm-demo-action')
  const subtitle = surface.querySelector<HTMLElement>('.wasm-demo-subtitle')
  const panelTitles = Array.from(surface.querySelectorAll<HTMLElement>('.wasm-demo-panel-title'))
  const valueElements = Array.from(surface.querySelectorAll<HTMLElement>('.wasm-demo-value'))
  const stepButtons = Array.from(surface.querySelectorAll<HTMLButtonElement>('.wasm-demo-step'))
  const noteElements = Array.from(surface.querySelectorAll<HTMLElement>('.wasm-demo-note'))
  const metricElements = Array.from(surface.querySelectorAll<HTMLElement>('.wasm-demo-metric'))
  const barFill = surface.querySelector<HTMLElement>('.wasm-demo-bar-fill')
  const historyRoot = surface.querySelector<HTMLElement>('.wasm-demo-history')
  const core = surface.querySelector<HTMLElement>('.wasm-demo-core')
  const coreValue = surface.querySelector<HTMLElement>('.wasm-demo-core-value')
  const coreHash = surface.querySelector<HTMLElement>('.wasm-demo-core-hash')
  const bits = surface.querySelector<HTMLElement>('.wasm-demo-bits')
  const footerChips = Array.from(surface.querySelectorAll<HTMLElement>('.wasm-demo-chip'))
  let inputA = 128
  let inputB = 256
  let history = [computeWasmMetrics(inputA, inputB).mixed]
  let pulseTimer = 0

  const update = () => {
    const metrics = computeWasmMetrics(inputA, inputB)
    const progress = Math.min(100, Math.max(0, metrics.hotPath))

    surface.dataset.preview = 'false'
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
    if (!button || !surface.contains(button)) return

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

  surface.addEventListener('click', handleClick)
  update()

  return {
    cleanup: () => {
      if (pulseTimer) {
        window.clearTimeout(pulseTimer)
      }
      surface.removeEventListener('click', handleClick)
    }
  }
}

const activateReactBinaryDemo = (root: HTMLElement): HomeDemoActivationResult => {
  const copy = getStaticHomeReactBinaryDemoCopy(getCurrentLang())
  const fragmentText = getStaticHomeFragmentTextCopy(getCurrentLang())
  if (copy.stages.length === 0) {
    warnMissingReactBinaryCopy()
    return {
      cleanup: () => undefined
    }
  }
  if (!hasPreparedActiveDemoMarkup(root, 'react-binary-demo')) {
    prepareActiveDemoRoot(root, 'react-binary-demo', getPreparedHomeDemoMarkup('react-binary'))
  }
  const surface = getPreparedActiveDemoSurface(root, 'react-binary-demo')
  const title = surface.querySelector<HTMLElement>('.react-binary-title')
  const actionButton = surface.querySelector<HTMLButtonElement>('.react-binary-action')
  const status = surface.querySelector<HTMLElement>('.react-binary-status')
  const steps = surface.querySelector<HTMLElement>('.react-binary-steps')
  const stepButtons = Array.from(surface.querySelectorAll<HTMLButtonElement>('.react-binary-step'))
  const panels = Array.from(surface.querySelectorAll<HTMLElement>('.react-binary-panel'))
  const connectors = Array.from(surface.querySelectorAll<HTMLElement>('.react-binary-connector'))
  const panelTitles = Array.from(surface.querySelectorAll<HTMLElement>('.react-binary-panel-title'))
  const captions = Array.from(surface.querySelectorAll<HTMLElement>('.react-binary-caption'))
  const footerChips = Array.from(surface.querySelectorAll<HTMLElement>('.react-binary-chip'))
  const nodeElements = Array.from(surface.querySelectorAll<HTMLElement>('.react-binary-node'))
  const bitsGroup = surface.querySelector<HTMLElement>('.react-binary-bits')
  const bitElements = Array.from(surface.querySelectorAll<HTMLElement>('.react-binary-bit'))
  const domTokenElements = Array.from(surface.querySelectorAll<HTMLElement>('.react-binary-dom-token'))
  const executionGate = createResidentFragmentExecutionGate({ root })
  let stageIndex = 0
  let binaryChunks = [...initialBinaryChunks]
  let timeoutHandle = 0

  const stopTimer = () => {
    if (!timeoutHandle) return
    window.clearTimeout(timeoutHandle)
    timeoutHandle = 0
  }

  const updateBits = () => {
    binaryChunks = binaryChunks.map((chunk) => randomBits(chunk.length))
    bitElements.forEach((element, index) => {
      element.textContent = binaryChunks[index] ?? ''
    })
  }

  const schedule = () => {
    if (timeoutHandle) return
    if (!executionGate.isActive()) return
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

    surface.dataset.preview = 'false'
    surface.dataset.stage = stage.id

    if (title) {
      title.textContent = copy.title
    }

    if (actionButton) {
      actionButton.disabled = false
      actionButton.dataset.action = 'advance'
      actionButton.dataset.stage = stage.id
      actionButton.removeAttribute('data-demo-activate')
      actionButton.textContent = actionLabel
    }

    if (status) {
      status.dataset.stage = stage.id
      status.textContent = stage.hint
    }

    if (steps) {
      steps.setAttribute('aria-label', copy.ariaStages)
    }

    stepButtons.forEach((button, index) => {
      const step = copy.stages[index]
      if (!step) return
      button.disabled = false
      button.dataset.stageIndex = `${index}`
      button.dataset.state = index < stageIndex ? 'done' : index === stageIndex ? 'active' : 'idle'
      button.setAttribute('aria-selected', index === stageIndex ? 'true' : 'false')
      button.tabIndex = index === stageIndex ? 0 : -1
      setReactStepLabel(button, step.label)
    })

    panels.forEach((panel) => {
      const panelStage = panel.dataset.panel
      const panelIndex = copy.stages.findIndex((item) => item.id === panelStage)
      panel.dataset.state = panelStage === stage.id ? 'active' : panelIndex >= 0 && panelIndex < stageIndex ? 'done' : 'idle'
    })

    connectors.forEach((connector) => {
      const connectorKey = connector.dataset.connector
      const isActive =
        (stage.id === 'binary' && connectorKey === 'react-binary') ||
        (stage.id === 'qwik' && (connectorKey === 'react-binary' || connectorKey === 'binary-qwik'))
      connector.dataset.state = isActive ? 'active' : 'idle'
    })

    panelTitles[0] && (panelTitles[0].textContent = copy.panels.reactTitle)
    panelTitles[1] && (panelTitles[1].textContent = copy.panels.binaryTitle)
    panelTitles[2] && (panelTitles[2].textContent = copy.panels.qwikTitle)
    captions[0] && (captions[0].textContent = copy.panels.reactCaption)
    captions[1] && (captions[1].textContent = copy.panels.binaryCaption)
    captions[2] && (captions[2].textContent = copy.panels.qwikCaption)
    footerChips[0] && (footerChips[0].textContent = copy.footer.hydrationSkipped)
    footerChips[1] && (footerChips[1].textContent = copy.footer.binaryStream)
    if (footerChips[0]) {
      footerChips[0].dataset.state = stage.id === 'react' ? 'active' : 'idle'
    }
    if (footerChips[1]) {
      footerChips[1].dataset.state = stage.id === 'binary' || stage.id === 'qwik' ? 'active' : 'idle'
    }
    nodeElements.forEach((element, index) => {
      const label = reactNodeLabels[index] ?? ''
      element.dataset.state = stage.id === 'react' ? (index === 0 ? 'active' : 'ready') : 'idle'
      element.textContent = fragmentText[label] ?? label
    })
    domTokenElements.forEach((element, index) => {
      element.dataset.state = stage.id === 'qwik' ? 'active' : stage.id === 'binary' ? 'ready' : 'idle'
      setStyleCustomProperty(element, '--react-binary-dom-delay', `${index * 70}ms`)
      element.textContent = reactDomPreviewTokens[index] ?? ''
    })

    if (bitsGroup) {
      bitsGroup.setAttribute('aria-label', copy.footer.binaryStream)
    }

    bitElements.forEach((element, index) => {
      element.dataset.anim = stage.id === 'binary' ? 'true' : 'false'
      element.dataset.state = stage.id === 'binary' ? 'active' : stage.id === 'qwik' ? 'ready' : 'idle'
      setStyleCustomProperty(element, '--react-binary-bit-delay', `${index * 65}ms`)
      element.textContent = binaryChunks[index] ?? ''
    })

    stopTimer()
    if (stage.id === 'binary') {
      updateBits()
      schedule()
    }
  }

  const handleClick = (event: Event) => {
    const button = (event.target as HTMLElement | null)?.closest('button') as HTMLButtonElement | null
    if (!button || !surface.contains(button)) return

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

  const viewportPlayback = bindHomeDemoViewportPlayback(root, (active) => {
    executionGate.setViewportActive(active)
  })

  const unsubscribeExecution = executionGate.subscribe((isActive) => {
    if (!isActive) {
      stopTimer()
      return
    }
    schedule()
  })

  surface.addEventListener('click', handleClick)
  update()

  return {
    cleanup: () => {
      stopTimer()
      unsubscribeExecution()
      executionGate.destroy()
      viewportPlayback.cleanup()
      surface.removeEventListener('click', handleClick)
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
    prepareActiveDemoRoot(root, 'preact-island-ui', getPreparedHomeDemoMarkup('preact-island'))
  }
  const surface = getPreparedActiveDemoSurface(root, 'preact-island-ui')
  const labelElement = surface.querySelector<HTMLElement>('.preact-island-label')
  const timer = surface.querySelector<HTMLElement>('.preact-island-timer')
  const stageTitle = surface.querySelector<HTMLElement>('.preact-island-stage-title')
  const stageTime = surface.querySelector<HTMLElement>('.preact-island-stage-time')
  const stageSub = surface.querySelector<HTMLElement>('.preact-island-stage-sub')
  const actionButton = surface.querySelector<HTMLButtonElement>('.preact-island-action')
  const progressCircle = surface.querySelector<SVGCircleElement>('.preact-island-dial-progress')
  const dialHand = surface.querySelector<SVGLineElement>('.preact-island-dial-hand')
  const executionGate = createResidentFragmentExecutionGate({ root })
  let limitSeconds = PREACT_COUNTDOWN_DEFAULT_SECONDS
  let remaining = PREACT_COUNTDOWN_DEFAULT_SECONDS
  let deadlineAtMs: number | null = Date.now() + PREACT_COUNTDOWN_DEFAULT_SECONDS * 1000
  let timeoutHandle = 0
  let cancelDeferredTick: () => void = () => undefined

  const clearTick = () => {
    if (!timeoutHandle) return
    window.clearTimeout(timeoutHandle)
    timeoutHandle = 0
  }

  const syncCompletionNotification = async (nextRemaining: number, nextDeadlineAtMs: number | null) => {
    if (nextRemaining <= 0 || !nextDeadlineAtMs) {
      await clearResidentNotificationIntent(root, PREACT_COUNTDOWN_NOTIFICATION_KEY)
      return
    }

    await emitResidentNotificationIntent(
      root,
      buildPreactIslandCompletionNotificationIntent(
        label,
        copy,
        nextDeadlineAtMs,
        resolvePreactIslandNotificationUrl()
      )
    )
  }

  const scheduleTick = () => {
    if (timeoutHandle) return
    if (!executionGate.isActive()) return
    if (remaining <= 0) return
    if (!deadlineAtMs) {
      deadlineAtMs = Date.now() + remaining * 1000
    }
    const delayMs = resolvePreactIslandTickDelayMs(deadlineAtMs)
    if (delayMs <= 0) {
      remaining = resolvePreactIslandRemainingSeconds(deadlineAtMs)
      update()
      return
    }
    timeoutHandle = window.setTimeout(() => {
      timeoutHandle = 0
      remaining = resolvePreactIslandRemainingSeconds(deadlineAtMs)
      update()
      if (remaining === 0) return
      scheduleTick()
    }, delayMs)
  }

  const applyCountdownState = (nextLimit: number, nextRemaining: number) => {
    clearTick()
    limitSeconds = nextLimit
    remaining = nextRemaining
    deadlineAtMs = nextRemaining > 0 ? Date.now() + nextRemaining * 1000 : null
    update()
    void syncCompletionNotification(nextRemaining, deadlineAtMs)
    scheduleTick()
  }

  const update = () => {
    const countdownLabel = formatPreactIslandClock(remaining)
    const progress = resolvePreactIslandProgress(remaining, limitSeconds)
    const circumference = Math.round(2 * Math.PI * 48)
    const offset = Math.round(circumference * (1 - progress))
    const rotation = Math.round((1 - progress) * -360)

    surface.dataset.preview = 'false'
    surface.dataset.running = remaining > 0 ? 'true' : 'false'
    labelElement && (labelElement.textContent = label)
    stageTitle && (stageTitle.textContent = copy.countdown)
    timer && (timer.textContent = remaining === 0 ? copy.ready : countdownLabel)
    stageTime && (stageTime.textContent = remaining === 0 ? '0:00' : countdownLabel)
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
    if (!button || !surface.contains(button)) return
    void requestNativeNotificationPermission()
    if (button.classList.contains('preact-island-adjust')) {
      const deltaSeconds = Number(button.getAttribute('data-adjust-seconds') ?? '0')
      const next = adjustPreactIslandCountdown(
        limitSeconds,
        remaining,
        Number.isFinite(deltaSeconds) ? deltaSeconds : 0
      )
      applyCountdownState(next.limitSeconds, next.remainingSeconds)
      return
    }
    applyCountdownState(limitSeconds, limitSeconds)
  }

  const viewportPlayback = bindHomeDemoViewportPlayback(root, (active) => {
    executionGate.setViewportActive(active)
  })

  const unsubscribeExecution = executionGate.subscribe((isActive) => {
    if (!isActive) {
      if (deadlineAtMs && remaining > 0) {
        remaining = resolvePreactIslandRemainingSeconds(deadlineAtMs)
        deadlineAtMs = null
        update()
      }
      clearTick()
      return
    }
    scheduleTick()
  })

  surface.addEventListener('click', handleClick)
  update()
  cancelDeferredTick = scheduleHomeDemoEnhancement(() => {
    void requestNativeNotificationPermission()
    void syncCompletionNotification(remaining, deadlineAtMs)
    scheduleTick()
  })

  return {
    cleanup: () => {
      cancelDeferredTick()
      clearTick()
      unsubscribeExecution()
      executionGate.destroy()
      viewportPlayback.cleanup()
      surface.removeEventListener('click', handleClick)
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

export const attachPlannerHomeDemo = async ({
  root
}: Pick<ActivateHomeDemoOptions, 'root' | 'props'>): Promise<HomeDemoActivationResult | null> => {
  const targetRoot = getRootElement(root)
  if (!hasPreparedActiveDemoMarkup(targetRoot, 'planner-demo')) {
    return null
  }
  seedStaticHomeDemoCopyFromBootstrapData()
  return activatePlannerDemo(targetRoot)
}

export const activateWasmRendererHomeDemo = async ({
  root
}: Pick<ActivateHomeDemoOptions, 'root' | 'props'>): Promise<HomeDemoActivationResult> => {
  await ensureStaticHomeDemoSeed()
  return activateWasmRendererDemo(getRootElement(root))
}

export const attachWasmRendererHomeDemo = async ({
  root
}: Pick<ActivateHomeDemoOptions, 'root' | 'props'>): Promise<HomeDemoActivationResult | null> => {
  const targetRoot = getRootElement(root)
  if (!hasPreparedActiveDemoMarkup(targetRoot, 'wasm-demo')) {
    return null
  }
  seedStaticHomeDemoCopyFromBootstrapData()
  return activateWasmRendererDemo(targetRoot)
}

export const activateReactBinaryHomeDemo = async ({
  root
}: Pick<ActivateHomeDemoOptions, 'root' | 'props'>): Promise<HomeDemoActivationResult> => {
  await ensureStaticHomeDemoSeed()
  return activateReactBinaryDemo(getRootElement(root))
}

export const attachReactBinaryHomeDemo = async ({
  root
}: Pick<ActivateHomeDemoOptions, 'root' | 'props'>): Promise<HomeDemoActivationResult | null> => {
  const targetRoot = getRootElement(root)
  if (!hasPreparedActiveDemoMarkup(targetRoot, 'react-binary-demo')) {
    return null
  }
  seedStaticHomeDemoCopyFromBootstrapData()
  return activateReactBinaryDemo(targetRoot)
}

export const activatePreactIslandHomeDemo = async ({
  root,
  props
}: Pick<ActivateHomeDemoOptions, 'root' | 'props'>): Promise<HomeDemoActivationResult> => {
  await ensureStaticHomeDemoSeed()
  return activatePreactIslandDemo(getRootElement(root), props)
}

export const attachPreactIslandHomeDemo = async ({
  root,
  props
}: Pick<ActivateHomeDemoOptions, 'root' | 'props'>): Promise<HomeDemoActivationResult | null> => {
  const targetRoot = getRootElement(root)
  if (!hasPreparedActiveDemoMarkup(targetRoot, 'preact-island-ui')) {
    return null
  }
  seedStaticHomeDemoCopyFromBootstrapData()
  return activatePreactIslandDemo(targetRoot, props)
}

export const attachHomeDemo = async ({
  root,
  kind,
  props
}: ActivateHomeDemoOptions): Promise<HomeDemoActivationResult | null> => {
  switch (kind) {
    case 'planner':
      return attachPlannerHomeDemo({ root, props })
    case 'wasm-renderer':
      return attachWasmRendererHomeDemo({ root, props })
    case 'react-binary':
      return attachReactBinaryHomeDemo({ root, props })
    case 'preact-island':
      return attachPreactIslandHomeDemo({ root, props })
    default:
      throw new Error(`Unsupported home demo: ${kind satisfies never}`)
  }
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
  preparedHomeDemoMarkupCache = null
}
