import { afterEach, describe, expect, it } from 'bun:test'
import {
  activateHomeDemo,
  attachHomeDemo,
  ensureStaticHomeDemoSeed,
  resetHomeDemoActivationForTests
} from './home-demo-activate'
import {
  getStaticHomeReactBinaryDemoCopy,
  getStaticHomeUiCopy,
  resetStaticHomeCopyForTests
} from './home-copy-store'
import { resetStaticShellSeedCacheForTests } from '../core/seed-client'
import {
  STATIC_HOME_DATA_SCRIPT_ID,
  STATIC_SHELL_SEED_SCRIPT_ID
} from '../core/constants'

class MockTextNode {
  constructor(public textContent: string) {}
}

type MockChildNode = MockElement | MockTextNode

class MockElement {
  className = ''
  dataset: Record<string, string> = {}
  disabled = false
  tabIndex = 0
  style: Record<string, string> = {}
  ownerDocument: MockDocument | null = null
  parentElement: MockElement | null = null
  lastInnerHtmlValue: unknown = null
  private attrs = new Map<string, string>()
  private listeners = new Map<string, Set<(event: Event) => void>>()
  private childNodes: MockChildNode[] = []
  private ownTextContent: string | null = ''

  constructor(readonly tagName: string = 'div') {}

  get classList() {
    const read = () => this.className.split(/\s+/).filter(Boolean)
    const write = (tokens: string[]) => {
      this.className = tokens.join(' ')
    }
    return {
      add: (...tokens: string[]) => {
        const next = new Set(read())
        tokens.forEach((token) => next.add(token))
        write([...next])
      },
      remove: (...tokens: string[]) => {
        const removals = new Set(tokens)
        write(read().filter((token) => !removals.has(token)))
      },
      contains: (token: string) => read().includes(token),
      toggle: (token: string, force?: boolean) => {
        const hasToken = read().includes(token)
        const shouldHaveToken = force ?? !hasToken
        if (shouldHaveToken) {
          if (!hasToken) {
            const next = read()
            next.push(token)
            write(next)
          }
          return true
        }
        if (hasToken) {
          write(read().filter((value) => value !== token))
        }
        return false
      }
    }
  }

  get textContent() {
    if (this.childNodes.length > 0) {
      return this.childNodes.map((node) => node.textContent).join('')
    }
    return this.ownTextContent ?? ''
  }

  set textContent(value: string) {
    this.ownTextContent = value
    this.childNodes = []
  }

  set innerHTML(_value: unknown) {
    this.lastInnerHtmlValue = _value
    this.ownTextContent = null
    this.childNodes = []
    if (this.className === 'planner-demo') {
      buildPlannerDemoTree(this)
    }
    if (this.className === 'react-binary-demo') {
      buildReactBinaryDemoTree(this)
    }
    if (this.className === 'preact-island-ui') {
      buildPreactIslandDemoTree(this)
    }
  }

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null
  }

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value)
    if (!name.startsWith('data-')) return
    const datasetKey = name
      .slice(5)
      .replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())
    this.dataset[datasetKey] = value
  }

  removeAttribute(name: string) {
    this.attrs.delete(name)
    if (!name.startsWith('data-')) return
    const datasetKey = name
      .slice(5)
      .replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())
    delete this.dataset[datasetKey]
  }

  append(...nodes: MockChildNode[]) {
    this.ownTextContent = null
    nodes.forEach((node) => {
      if (node instanceof MockElement) {
        node.parentElement = this
      }
      this.childNodes.push(node)
    })
  }

  replaceChildren(...nodes: MockChildNode[]) {
    this.childNodes = []
    this.ownTextContent = null
    this.append(...nodes)
  }

  addEventListener(type: string, listener: (event: Event) => void) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: (event: Event) => void) {
    const listeners = this.listeners.get(type)
    listeners?.delete(listener)
  }

  dispatchEvent(event: Event) {
    const targetEvent = event as Event & { target?: EventTarget | null }
    if (!targetEvent.target) {
      Object.defineProperty(targetEvent, 'target', {
        configurable: true,
        value: this
      })
    }

    let current: MockElement | null = this
    while (current) {
      current.listeners.get(event.type)?.forEach((listener) => listener(targetEvent))
      current = current.parentElement
    }

    return true
  }

  closest(selector: string) {
    let current: MockElement | null = this
    while (current) {
      if (current.matches(selector)) return current
      current = current.parentElement
    }
    return null
  }

  querySelector(selector: string) {
    return this.querySelectorAll(selector)[0] ?? null
  }

  querySelectorAll(selector: string) {
    const parts = selector.trim().split(/\s+/)
    const candidates = this.getDescendants().filter((node) => node.matches(parts[parts.length - 1]))
    return candidates.filter((candidate) => {
      let ancestor = candidate.parentElement
      for (let index = parts.length - 2; index >= 0; index -= 1) {
        while (ancestor && !ancestor.matches(parts[index])) {
          ancestor = ancestor.parentElement
        }
        if (!ancestor) return false
        ancestor = ancestor.parentElement
      }
      return true
    })
  }

  contains(node: MockElement | null) {
    if (!node) return false
    let current: MockElement | null = node
    while (current) {
      if (current === this) return true
      current = current.parentElement
    }
    return false
  }

  private getDescendants(): MockElement[] {
    const results: MockElement[] = []
    this.childNodes.forEach((node) => {
      if (!(node instanceof MockElement)) return
      results.push(node)
      results.push(...node.getDescendants())
    })
    return results
  }

  private matches(selector: string) {
    if (selector.startsWith('.')) {
      return this.className.split(/\s+/).includes(selector.slice(1))
    }
    return this.tagName.toLowerCase() === selector.toLowerCase()
  }
}

class MockDocument {
  documentElement = { lang: 'en-US' }
  visibilityState: 'visible' | 'hidden' = 'visible'
  private listeners = new Map<string, Set<(event: Event) => void>>()
  private scripts = new Map<string, { textContent: string | null }>()

  addEventListener(type: string, listener: (event: Event) => void) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: (event: Event) => void) {
    this.listeners.get(type)?.delete(listener)
  }

  dispatchEvent(event: Event) {
    this.listeners.get(event.type)?.forEach((listener) => listener(event))
    return true
  }

  createElement(tagName: string) {
    const element = new MockElement(tagName)
    element.ownerDocument = this
    return element
  }

  createTextNode(textContent: string) {
    return new MockTextNode(textContent)
  }

  getElementById(id: string) {
    return this.scripts.get(id) ?? null
  }

  setScript(id: string, value: unknown) {
    this.scripts.set(id, { textContent: JSON.stringify(value) })
  }
}

const createElement = (root: MockElement, tagName: string, className?: string) => {
  const element = root.ownerDocument?.createElement(tagName) ?? new MockElement(tagName)
  if (className) {
    element.className = className
  }
  return element
}

const plannerStepCount = 5
const plannerCardCount = 3

const buildPlannerDemoTree = (root: MockElement) => {
  const header = createElement(root, 'div', 'planner-demo-header')
  const title = createElement(root, 'div', 'planner-demo-title')
  const controls = createElement(root, 'div', 'planner-demo-controls')
  controls.append(
    createElement(root, 'button', 'planner-demo-action'),
    createElement(root, 'button', 'planner-demo-secondary')
  )
  header.append(title, controls)

  const status = createElement(root, 'div', 'planner-demo-status')
  const steps = createElement(root, 'div', 'planner-demo-steps')
  for (let index = 0; index < plannerStepCount; index += 1) {
    steps.append(createElement(root, 'div', 'planner-demo-step'))
  }

  const grid = createElement(root, 'div', 'planner-demo-grid')
  for (let index = 0; index < plannerCardCount; index += 1) {
    const card = createElement(root, 'div', 'planner-demo-card')
    const dependencyRow = createElement(root, 'div', 'planner-demo-row planner-demo-row--dependencies')
    const cacheRow = createElement(root, 'div', 'planner-demo-row planner-demo-row--cache')
    cacheRow.append(createElement(root, 'button', 'planner-demo-toggle'))
    const runtimeRow = createElement(root, 'div', 'planner-demo-row planner-demo-row--runtime')
    const renderOutcome = createElement(root, 'div', 'planner-demo-outcome')
    const revalidateOutcome = createElement(root, 'div', 'planner-demo-outcome is-muted')
    card.append(dependencyRow, cacheRow, runtimeRow, renderOutcome, revalidateOutcome)
    grid.append(card)
  }

  root.replaceChildren(header, status, steps, grid)
}

const buildReactBinaryDemoTree = (root: MockElement) => {
  const header = createElement(root, 'div', 'react-binary-header')
  const controls = createElement(root, 'div', 'react-binary-controls')
  const title = createElement(root, 'div', 'react-binary-title')
  const action = createElement(root, 'button', 'react-binary-action')
  const status = createElement(root, 'div', 'react-binary-status')
  controls.append(title, action)
  header.append(controls, status)

  const steps = createElement(root, 'div', 'react-binary-steps')
  for (let index = 0; index < 3; index += 1) {
    steps.append(createElement(root, 'button', 'react-binary-step'))
  }

  const track = createElement(root, 'div', 'react-binary-track')
  const reactPanel = createElement(root, 'div', 'react-binary-panel')
  reactPanel.setAttribute('data-panel', 'react')
  reactPanel.append(createElement(root, 'div', 'react-binary-panel-title'))
  const nodeTree = createElement(root, 'div', 'react-binary-node-tree')
  for (let index = 0; index < 5; index += 1) {
    nodeTree.append(createElement(root, 'div', 'react-binary-node'))
  }
  reactPanel.append(nodeTree, createElement(root, 'div', 'react-binary-caption'))

  const binaryPanel = createElement(root, 'div', 'react-binary-panel')
  binaryPanel.setAttribute('data-panel', 'binary')
  binaryPanel.append(createElement(root, 'div', 'react-binary-panel-title'))
  const bits = createElement(root, 'div', 'react-binary-bits')
  bits.append(createElement(root, 'span'))
  binaryPanel.append(bits, createElement(root, 'div', 'react-binary-caption'))

  const qwikPanel = createElement(root, 'div', 'react-binary-panel')
  qwikPanel.setAttribute('data-panel', 'qwik')
  qwikPanel.append(createElement(root, 'div', 'react-binary-panel-title'))
  const dom = createElement(root, 'div', 'react-binary-dom')
  dom.append(createElement(root, 'span'))
  qwikPanel.append(dom, createElement(root, 'div', 'react-binary-caption'))

  track.append(reactPanel, binaryPanel, qwikPanel)

  const footer = createElement(root, 'div', 'react-binary-footer')
  footer.append(createElement(root, 'span', 'react-binary-chip'))
  footer.append(createElement(root, 'span', 'react-binary-chip'))

  root.replaceChildren(header, steps, track, footer)
}

const buildPreactIslandDemoTree = (root: MockElement) => {
  const label = createElement(root, 'div', 'preact-island-label')
  const timer = createElement(root, 'div', 'preact-island-timer')
  const stage = createElement(root, 'div', 'preact-island-stage')
  const dial = createElement(root, 'svg', 'preact-island-dial')
  const progress = createElement(root, 'circle', 'preact-island-dial-progress')
  const hand = createElement(root, 'line', 'preact-island-dial-hand')
  dial.append(progress, hand)
  stage.append(
    dial,
    createElement(root, 'div', 'preact-island-stage-title'),
    createElement(root, 'div', 'preact-island-stage-time'),
    createElement(root, 'div', 'preact-island-stage-sub')
  )
  const action = createElement(root, 'button', 'preact-island-action')
  root.replaceChildren(label, timer, stage, action)
}

const shellSeed = {
  lang: 'en',
  currentPath: '/',
  languageSeed: {
    ui: {
      navHome: 'Home',
      demoActivate: 'Activate demo'
    }
  },
  bootstrapMode: 'home-static',
  authPolicy: 'public',
  isAuthenticated: false,
  snapshotKey: '/'
}

const routeSeed = {
  lang: 'en',
  path: '/',
  snapshotKey: '/',
  languageSeed: {
    ui: {
      demoActivate: 'Launch demo',
      demoActivating: 'Launching demo...'
    },
    demos: {
      planner: {
        title: 'Planner demo',
        run: 'Run',
        running: 'Running...',
        shuffle: 'Shuffle',
        waiting: 'Waiting for plan',
        steps: [
          { id: 'deps', label: 'Resolve deps', hint: 'Resolve the dependency graph.' },
          { id: 'cache', label: 'Check cache', hint: 'Check the cache.' },
          { id: 'runtime', label: 'Select runtime', hint: 'Pick a runtime.' },
          { id: 'render', label: 'Render misses', hint: 'Render the missing fragments.' },
          { id: 'revalidate', label: 'Async revalidate', hint: 'Queue revalidation.' }
        ],
        fragments: [
          {
            id: 'fragment://planner/root',
            label: 'Root card',
            deps: [],
            runtime: 'WASM'
          },
          {
            id: 'fragment://planner/store',
            label: 'Store card',
            deps: ['manifest'],
            runtime: 'Edge'
          },
          {
            id: 'fragment://planner/profile',
            label: 'Profile card',
            deps: ['auth', 'profile'],
            runtime: 'Bun'
          }
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
        waitingCache: 'Waiting cache',
        selecting: 'Selecting runtime',
        renderNow: 'Render now',
        skipRender: 'Skip render',
        awaitRender: 'Await render',
        revalidateQueued: 'Revalidate queued',
        freshRender: 'Fresh render',
        awaitRevalidate: 'Await revalidate'
      },
      reactBinary: {
        title: 'Binary authoring',
        actions: {
          react: 'Compile to binary',
          binary: 'Inspect stream',
          qwik: 'Replay DOM'
        },
        stages: [
          {
            id: 'react',
            label: 'React fragment',
            hint: 'Render once on the server.'
          },
          {
            id: 'binary',
            label: 'Binary stream',
            hint: 'Serialize the fragment tree.'
          },
          {
            id: 'qwik',
            label: 'Qwik DOM',
            hint: 'Replay without hydration.'
          }
        ],
        ariaStages: 'Compilation stages',
        panels: {
          reactTitle: 'React fragment',
          binaryTitle: 'Binary stream',
          qwikTitle: 'Qwik DOM',
          reactCaption: 'Server render only.',
          binaryCaption: 'Binary tree output.',
          qwikCaption: 'DOM replay.'
        },
        footer: {
          hydrationSkipped: 'Hydration skipped',
          binaryStream: 'Binary tree stream'
        }
      }
    }
  },
  fragmentVersions: {
    'fragment://page/home/react@v1': 1
  }
}

const installBootstrapScripts = (
  doc: MockDocument,
  options: {
    shellSeed?: Record<string, unknown>
    routeSeed?: Record<string, unknown>
  } = {}
) => {
  doc.setScript(STATIC_SHELL_SEED_SCRIPT_ID, { ...shellSeed, ...(options.shellSeed ?? {}) })
  doc.setScript(STATIC_HOME_DATA_SCRIPT_ID, { ...routeSeed, ...(options.routeSeed ?? {}) })
}

const originalGlobals = {
  document: (globalThis as typeof globalThis & { document?: Document }).document,
  window: (globalThis as typeof globalThis & { window?: Window & typeof globalThis }).window,
  HTMLElement: (globalThis as typeof globalThis & { HTMLElement?: typeof HTMLElement }).HTMLElement,
  trustedTypes: (globalThis as typeof globalThis & { trustedTypes?: unknown }).trustedTypes
}

const installDomGlobals = (doc: MockDocument) => {
  ;(globalThis as typeof globalThis & { document?: MockDocument }).document = doc
  ;(globalThis as typeof globalThis & { window?: Window & typeof globalThis }).window =
    globalThis as Window & typeof globalThis
  ;(globalThis as typeof globalThis & { HTMLElement?: typeof MockElement }).HTMLElement =
    MockElement as unknown as typeof HTMLElement
  ;(globalThis as typeof globalThis & { trustedTypes?: unknown }).trustedTypes = {
    createPolicy: (name: string) => ({
      createHTML: (input: string) => ({ __html: input, policy: name })
    })
  }
}

afterEach(() => {
  resetStaticHomeCopyForTests()
  resetHomeDemoActivationForTests()
  resetStaticShellSeedCacheForTests()

  if (originalGlobals.document) {
    ;(globalThis as typeof globalThis & { document?: Document }).document = originalGlobals.document
  } else {
    delete (globalThis as typeof globalThis & { document?: Document }).document
  }

  if (originalGlobals.window) {
    ;(globalThis as typeof globalThis & { window?: Window & typeof globalThis }).window = originalGlobals.window
  } else {
    delete (globalThis as typeof globalThis & { window?: Window & typeof globalThis }).window
  }

  if (originalGlobals.HTMLElement) {
    ;(globalThis as typeof globalThis & { HTMLElement?: typeof HTMLElement }).HTMLElement =
      originalGlobals.HTMLElement
  } else {
    delete (globalThis as typeof globalThis & { HTMLElement?: typeof HTMLElement }).HTMLElement
  }

  if (originalGlobals.trustedTypes !== undefined) {
    ;(globalThis as typeof globalThis & { trustedTypes?: unknown }).trustedTypes = originalGlobals.trustedTypes
  } else {
    delete (globalThis as typeof globalThis & { trustedTypes?: unknown }).trustedTypes
  }
})

describe('home-demo-activate', () => {
  it('seeds runtime copy from shared bootstrap scripts', async () => {
    const doc = new MockDocument()
    installBootstrapScripts(doc)

    const data = await ensureStaticHomeDemoSeed(doc as never)

    expect(data?.lang).toBe('en')
    expect(getStaticHomeUiCopy('en-US').demoActivate).toBe('Launch demo')
    expect(getStaticHomeReactBinaryDemoCopy('en-US').stages.map((stage) => stage.id)).toEqual([
      'react',
      'binary',
      'qwik'
    ])
  })

  it('renders populated react-binary controls after runtime seeding', async () => {
    const doc = new MockDocument()
    installBootstrapScripts(doc)
    installDomGlobals(doc)
    const root = doc.createElement('div')
    root.setAttribute('data-home-preview', 'compact')

    const result = await activateHomeDemo({
      root: root as never,
      kind: 'react-binary',
      props: {}
    })

    expect(root.getAttribute('data-home-demo-active')).toBe('true')
    expect(root.querySelector('.react-binary-action')?.textContent).toBe('Compile to binary')
    expect(root.querySelector('.react-binary-status')?.textContent).toBe('Render once on the server.')
    expect(root.querySelectorAll('.react-binary-step').map((step) => step.textContent)).toEqual([
      'React fragment',
      'Binary stream',
      'Qwik DOM'
    ])
    expect(root.querySelectorAll('.react-binary-panel-title').map((title) => title.textContent)).toEqual([
      'React fragment',
      'Binary stream',
      'Qwik DOM'
    ])

    result.cleanup()
  })

  it('reapplies localized react-binary copy when the same root is activated after a language swap', async () => {
    const doc = new MockDocument()
    installBootstrapScripts(doc)
    installDomGlobals(doc)
    const root = doc.createElement('div')
    root.setAttribute('data-home-preview', 'compact')

    const englishResult = await activateHomeDemo({
      root: root as never,
      kind: 'react-binary',
      props: {}
    })

    expect(root.querySelector('.react-binary-title')?.textContent).toBe('Binary authoring')
    expect(root.querySelector('.react-binary-steps')?.getAttribute('aria-label')).toBe('Compilation stages')
    expect(root.querySelector('.react-binary-bits')?.getAttribute('aria-label')).toBe('Binary tree stream')

    englishResult.cleanup()

    doc.documentElement.lang = 'ja-JP'
    installBootstrapScripts(doc, {
      shellSeed: {
        lang: 'ja'
      },
      routeSeed: {
        lang: 'ja',
        languageSeed: {
          ...routeSeed.languageSeed,
          demos: {
            ...routeSeed.languageSeed.demos,
            reactBinary: {
              ...routeSeed.languageSeed.demos.reactBinary,
              title: 'バイナリコンパイルデモ',
              actions: {
                react: 'バイナリにコンパイル',
                binary: 'ストリームを確認',
                qwik: 'DOM を再生'
              },
              stages: [
                {
                  id: 'react',
                  label: 'React フラグメント',
                  hint: 'React フラグメントはサーバーのみでレンダリングされます。'
                },
                {
                  id: 'binary',
                  label: 'バイナリストリーム',
                  hint: 'バイナリツリーをシリアライズします。'
                },
                {
                  id: 'qwik',
                  label: 'Qwik DOM',
                  hint: 'ハイドレーションなしで再生します。'
                }
              ],
              ariaStages: 'コンパイル段階',
              panels: {
                reactTitle: 'React フラグメント',
                binaryTitle: 'バイナリストリーム',
                qwikTitle: 'Qwik DOM',
                reactCaption: 'サーバー専用レンダー。',
                binaryCaption: 'バイナリツリー出力。',
                qwikCaption: 'DOM 再生。'
              },
              footer: {
                hydrationSkipped: 'ハイドレーションを省略',
                binaryStream: 'バイナリツリーストリーム'
              }
            }
          }
        }
      }
    })

    const japaneseResult = await activateHomeDemo({
      root: root as never,
      kind: 'react-binary',
      props: {}
    })

    expect(root.querySelector('.react-binary-title')?.textContent).toBe('バイナリコンパイルデモ')
    expect(root.querySelector('.react-binary-action')?.textContent).toBe('バイナリにコンパイル')
    expect(root.querySelector('.react-binary-status')?.textContent).toBe(
      'React フラグメントはサーバーのみでレンダリングされます。'
    )
    expect(root.querySelector('.react-binary-steps')?.getAttribute('aria-label')).toBe('コンパイル段階')
    expect(root.querySelector('.react-binary-bits')?.getAttribute('aria-label')).toBe('バイナリツリーストリーム')

    japaneseResult.cleanup()
  })

  it('localizes react-binary node labels from fragment text copy', async () => {
    const doc = new MockDocument()
    installBootstrapScripts(doc, {
      routeSeed: {
        ...routeSeed,
        languageSeed: {
          ...routeSeed.languageSeed,
          fragments: {
            Fragment: 'Localized Fragment Node',
            Card: 'Localized Card Node',
            Title: 'Localized Title Node',
            Copy: 'Localized Copy Node',
            Badge: 'Localized Badge Node'
          }
        }
      }
    })
    installDomGlobals(doc)
    const root = doc.createElement('div')
    root.setAttribute('data-home-preview', 'compact')

    const result = await activateHomeDemo({
      root: root as never,
      kind: 'react-binary',
      props: {}
    })

    expect(root.querySelectorAll('.react-binary-node').map((node) => node.textContent)).toEqual([
      'Localized Fragment Node',
      'Localized Card Node',
      'Localized Title Node',
      'Localized Copy Node',
      'Localized Badge Node'
    ])

    result.cleanup()
  })

  it('renders flatter planner cards without nested value, pill, or outcome wrapper nodes', async () => {
    const doc = new MockDocument()
    installBootstrapScripts(doc)
    installDomGlobals(doc)
    const root = doc.createElement('div')
    root.setAttribute('data-home-preview', 'compact')

    const result = await activateHomeDemo({
      root: root as never,
      kind: 'planner',
      props: {}
    })

    expect(root.getAttribute('data-home-demo-active')).toBe('true')
    expect(root.querySelectorAll('.planner-demo-card')).toHaveLength(plannerCardCount)
    expect(root.querySelector('.planner-demo-value')).toBeNull()
    expect(root.querySelector('.planner-demo-pill')).toBeNull()
    expect(root.querySelector('.planner-demo-outcomes')).toBeNull()
    expect(root.querySelector('.planner-demo-row--dependencies')?.textContent).toBe('root')
    expect(root.querySelector('.planner-demo-row--dependencies')?.dataset.pill).toBe('Pending')
    expect(root.querySelector('.planner-demo-row--dependencies')?.getAttribute('aria-label')).toBeNull()
    expect(root.querySelector('.planner-demo-row--runtime')?.textContent).toBe('Selecting runtime')
    expect(root.querySelector('.planner-demo-row--runtime')?.dataset.pill).toBe('Selecting runtime')
    expect(root.querySelector('.planner-demo-row--runtime')?.getAttribute('aria-label')).toBeNull()

    result.cleanup()
  })

  it('uses the trusted server-html policy for runtime demo shells', async () => {
    const doc = new MockDocument()
    installBootstrapScripts(doc)
    installDomGlobals(doc)
    const root = doc.createElement('div')
    root.setAttribute('data-home-preview', 'compact')

    const result = await activateHomeDemo({
      root: root as never,
      kind: 'react-binary',
      props: {}
    })

    expect((root.lastInnerHtmlValue as { policy?: string } | null)?.policy).toBe(
      'prometheus-server-html'
    )

    result.cleanup()
  })

  it('attaches the SSR react binary demo shell without falling back to a rebuild', async () => {
    const doc = new MockDocument()
    installBootstrapScripts(doc)
    installDomGlobals(doc)
    const root = doc.createElement('div')
    root.className = 'react-binary-demo'
    root.setAttribute('data-home-demo-ssr-active', 'true')

    const result = await attachHomeDemo({
      root: root as never,
      kind: 'react-binary',
      props: {}
    })

    expect(result).not.toBeNull()
    expect(root.lastInnerHtmlValue).toBeNull()

    result?.cleanup()
  })

  it('does not throw when react-binary copy is unavailable', async () => {
    resetStaticHomeCopyForTests()
    resetHomeDemoActivationForTests()
    resetStaticShellSeedCacheForTests()
    const doc = new MockDocument()
    installDomGlobals(doc)
    const root = doc.createElement('div')
    root.setAttribute('data-home-preview', 'compact')
    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (message?: unknown) => {
      warnings.push(String(message ?? ''))
    }

    try {
      const result = await activateHomeDemo({
        root: root as never,
        kind: 'react-binary',
        props: {}
      })

      expect(root.getAttribute('data-home-demo-active')).toBeNull()
      expect(warnings).toEqual([
        'Static home react demo copy was missing at activation time; keeping compact preview intact.'
      ])
      result.cleanup()
    } finally {
      console.warn = originalWarn
    }
  })

  it('pauses and resumes the preact countdown when viewport playback changes', async () => {
    const doc = new MockDocument()
    installBootstrapScripts(doc)
    installDomGlobals(doc)
    const root = doc.createElement('div')
    root.setAttribute('data-home-preview', 'compact')

    const result = await activateHomeDemo({
      root: root as never,
      kind: 'preact-island',
      props: {}
    })

    const stageTime = root.querySelector('.preact-island-stage-time')
    expect(stageTime?.textContent).toBe('1:00')

    await new Promise((resolve) => setTimeout(resolve, 1100))
    const tickingValue = stageTime?.textContent
    expect(tickingValue).toBe('0:59')

    result.setViewportActive?.(false)
    await new Promise((resolve) => setTimeout(resolve, 1100))
    expect(stageTime?.textContent).toBe(tickingValue)

    result.setViewportActive?.(true)
    await new Promise((resolve) => setTimeout(resolve, 1100))
    expect(stageTime?.textContent).toBe('0:58')

    result.cleanup()
  })

  it('pauses and resumes the react binary stream animation when viewport playback changes', async () => {
    const doc = new MockDocument()
    installBootstrapScripts(doc)
    installDomGlobals(doc)
    const root = doc.createElement('div')
    root.setAttribute('data-home-preview', 'compact')

    const result = await activateHomeDemo({
      root: root as never,
      kind: 'react-binary',
      props: {}
    })

    const actionButton = root.querySelector('.react-binary-action')
    expect(actionButton).toBeTruthy()
    actionButton?.dispatchEvent(new Event('click'))

    const bits = root.querySelector('.react-binary-bits span')
    const initialBits = bits?.textContent
    await new Promise((resolve) => setTimeout(resolve, 750))
    const advancedBits = bits?.textContent
    expect(advancedBits).not.toBe(initialBits)

    result.setViewportActive?.(false)
    const pausedBits = bits?.textContent
    await new Promise((resolve) => setTimeout(resolve, 800))
    expect(bits?.textContent).toBe(pausedBits)

    result.setViewportActive?.(true)
    await new Promise((resolve) => setTimeout(resolve, 800))
    expect(bits?.textContent).not.toBe(pausedBits)

    result.cleanup()
  })
})
