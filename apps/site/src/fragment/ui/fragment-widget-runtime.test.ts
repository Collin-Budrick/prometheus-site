import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { createFragmentWidgetRuntime } from './fragment-widget-runtime'

const FRAGMENT_WIDGET_SELECTOR = '[data-fragment-widget]'
const FRAGMENT_WIDGET_PROPS_SELECTOR = 'script[data-fragment-widget-props]'

type MockIntersectionEntry = {
  target: Element
  intersectionRatio: number
  isIntersecting: boolean
}

class MockScriptElement {
  textContent: string

  constructor(textContent: string) {
    this.textContent = textContent
  }
}

class MockWidgetElement {
  readonly nodeType = 1
  isConnected = true
  readonly dataset: Record<string, string>
  private readonly propsScript: MockScriptElement

  constructor(priority: 'critical' | 'visible' | 'deferred') {
    this.dataset = {
      fragmentWidget: 'contact-invites',
      fragmentWidgetId: 'fragment://page/test/contact@v1::contact-invites',
      fragmentWidgetPriority: priority,
      fragmentWidgetHydrated: 'false'
    }
    this.propsScript = new MockScriptElement('{}')
  }

  matches(selector: string) {
    return selector === FRAGMENT_WIDGET_SELECTOR
  }

  closest(selector: string) {
    return this.matches(selector) ? this : null
  }

  querySelector(selector: string) {
    if (selector === FRAGMENT_WIDGET_PROPS_SELECTOR) {
      return this.propsScript
    }
    return null
  }

  querySelectorAll(_selector: string) {
    return []
  }
}

class MockRootElement {
  readonly nodeType = 1
  readonly dataset: Record<string, string> = {}
  readonly widgets: MockWidgetElement[]

  constructor(widgets: MockWidgetElement[]) {
    this.widgets = widgets
  }

  matches(_selector: string) {
    return false
  }

  querySelector(selector: string) {
    return selector === FRAGMENT_WIDGET_SELECTOR ? this.widgets[0] ?? null : null
  }

  querySelectorAll(selector: string) {
    return selector === FRAGMENT_WIDGET_SELECTOR ? this.widgets : []
  }
}

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []

  readonly observed = new Set<Element>()
  readonly callback: (entries: MockIntersectionEntry[]) => void

  constructor(callback: (entries: MockIntersectionEntry[]) => void) {
    this.callback = callback
    MockIntersectionObserver.instances.push(this)
  }

  observe(target: Element) {
    this.observed.add(target)
  }

  unobserve(target: Element) {
    this.observed.delete(target)
  }

  disconnect() {
    this.observed.clear()
  }

  emit(entries: MockIntersectionEntry[]) {
    this.callback(entries)
  }
}

const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const createWidgetRoot = (priority: 'critical' | 'visible' | 'deferred' = 'visible') => {
  const widget = new MockWidgetElement(priority)
  const root = new MockRootElement([widget])
  return {
    root,
    widget
  }
}

describe('createFragmentWidgetRuntime', () => {
  const originalIntersectionObserver = globalThis.IntersectionObserver
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame
  const originalConsoleWarn = console.warn

  beforeEach(() => {
    MockIntersectionObserver.instances = []
    console.warn = () => undefined
  })

  afterEach(() => {
    MockIntersectionObserver.instances = []
    globalThis.IntersectionObserver = originalIntersectionObserver
    globalThis.requestAnimationFrame = originalRequestAnimationFrame
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame
    console.warn = originalConsoleWarn
  })

  it('waits for actual intersection before attaching visible widgets', async () => {
    globalThis.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver
    let scheduledPaintCallback: FrameRequestCallback | null = null
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      scheduledPaintCallback = callback
      return 1
    }) as typeof requestAnimationFrame
    globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame

    const { root, widget } = createWidgetRoot('visible')
    const runtime = createFragmentWidgetRuntime({ root: root as unknown as ParentNode })

    expect(MockIntersectionObserver.instances).toHaveLength(1)
    expect(MockIntersectionObserver.instances[0]?.observed.has(widget)).toBe(true)
    expect(widget.dataset.fragmentWidgetHydrated).toBe('false')
    expect(scheduledPaintCallback).toBeNull()

    MockIntersectionObserver.instances[0]?.emit([
      {
        target: widget,
        intersectionRatio: 0,
        isIntersecting: false
      }
    ])
    await flushMicrotasks()
    expect(widget.dataset.fragmentWidgetHydrated).toBe('false')

    MockIntersectionObserver.instances[0]?.emit([
      {
        target: widget,
        intersectionRatio: 1,
        isIntersecting: true
      }
    ])
    await flushMicrotasks()
    expect(widget.dataset.fragmentWidgetHydrated).toBe('true')

    runtime.destroy()
  })

  it('still attaches critical widgets on the next paint tick', async () => {
    let scheduledPaintCallback: FrameRequestCallback | null = null
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      scheduledPaintCallback = callback
      return 1
    }) as typeof requestAnimationFrame
    globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame

    const { root, widget } = createWidgetRoot('critical')
    const runtime = createFragmentWidgetRuntime({ root: root as unknown as ParentNode })

    expect(widget.dataset.fragmentWidgetHydrated).toBe('false')
    expect(typeof scheduledPaintCallback).toBe('function')

    scheduledPaintCallback?.(16.7)
    await flushMicrotasks()
    expect(widget.dataset.fragmentWidgetHydrated).toBe('true')

    runtime.destroy()
  })
})
