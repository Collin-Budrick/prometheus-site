import { afterEach, describe, expect, it } from 'bun:test'
import {
  activateHomeDemo,
  ensureStaticHomeDemoSeed,
  resetHomeDemoActivationForTests
} from './home-demo-activate'
import {
  getStaticHomeReactBinaryDemoCopy,
  getStaticHomeUiCopy,
  resetStaticHomeCopyForTests
} from './home-copy-store'
import {
  STATIC_HOME_DATA_SCRIPT_ID,
  STATIC_SHELL_SEED_SCRIPT_ID
} from './constants'

class MockTextNode {
  constructor(public textContent: string) {}
}

type MockChildNode = MockElement | MockTextNode

class MockElement {
  className = ''
  dataset: Record<string, string> = {}
  disabled = false
  tabIndex = 0
  ownerDocument: MockDocument | null = null
  parentElement: MockElement | null = null
  private attrs = new Map<string, string>()
  private listeners = new Map<string, Set<(event: Event) => void>>()
  private childNodes: MockChildNode[] = []
  private ownTextContent: string | null = ''

  constructor(readonly tagName: string = 'div') {}

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

  set innerHTML(_value: string) {
    this.ownTextContent = null
    this.childNodes = []
    if (this.className === 'react-binary-demo') {
      buildReactBinaryDemoTree(this)
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

const installBootstrapScripts = (doc: MockDocument) => {
  doc.setScript(STATIC_SHELL_SEED_SCRIPT_ID, shellSeed)
  doc.setScript(STATIC_HOME_DATA_SCRIPT_ID, routeSeed)
}

const originalGlobals = {
  document: (globalThis as typeof globalThis & { document?: Document }).document,
  window: (globalThis as typeof globalThis & { window?: Window & typeof globalThis }).window,
  HTMLElement: (globalThis as typeof globalThis & { HTMLElement?: typeof HTMLElement }).HTMLElement
}

const installDomGlobals = (doc: MockDocument) => {
  ;(globalThis as typeof globalThis & { document?: MockDocument }).document = doc
  ;(globalThis as typeof globalThis & { window?: Window & typeof globalThis }).window =
    globalThis as Window & typeof globalThis
  ;(globalThis as typeof globalThis & { HTMLElement?: typeof MockElement }).HTMLElement =
    MockElement as unknown as typeof HTMLElement
}

afterEach(() => {
  resetStaticHomeCopyForTests()
  resetHomeDemoActivationForTests()

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
})

describe('home-demo-activate', () => {
  it('seeds runtime copy from shared bootstrap scripts', () => {
    const doc = new MockDocument()
    installBootstrapScripts(doc)

    const data = ensureStaticHomeDemoSeed(doc as never)

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

  it('does not throw when react-binary copy is unavailable', async () => {
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
})
