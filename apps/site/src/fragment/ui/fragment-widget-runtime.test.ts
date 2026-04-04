import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { createFragmentWidgetRuntime } from './fragment-widget-runtime'

const FRAGMENT_WIDGET_SELECTOR = '[data-fragment-widget]'
const FRAGMENT_WIDGET_PROPS_SELECTOR =
  'template[data-fragment-widget-props],script[data-fragment-widget-props]'

type MockIntersectionEntry = {
  target: Element
  intersectionRatio: number
  isIntersecting: boolean
}

class MockScriptElement {
  tagName = 'SCRIPT'
  textContent: string

  constructor(textContent: string) {
    this.textContent = textContent
  }
}

class MockTemplateElement {
  tagName = 'TEMPLATE'
  innerHTML: string
  textContent = ''
  content: { textContent: string | null }

  constructor(innerHTML: string, contentText: string | null = innerHTML) {
    this.innerHTML = innerHTML
    this.content = { textContent: contentText }
  }
}

class MockWidgetElement {
  readonly nodeType = 1
  isConnected = true
  readonly dataset: Record<string, string>
  private readonly propsNode: MockScriptElement | MockTemplateElement
  private readonly rect: {
    top: number
    right: number
    bottom: number
    left: number
    width: number
    height: number
  }

  constructor(
    priority: 'critical' | 'visible' | 'deferred',
    propsNode: MockScriptElement | MockTemplateElement = new MockScriptElement('{}'),
    rect: Partial<{
      top: number
      right: number
      bottom: number
      left: number
      width: number
      height: number
    }> = {}
  ) {
    this.dataset = {
      fragmentWidget: 'contact-invites',
      fragmentWidgetId: 'fragment://page/test/contact@v1::contact-invites',
      fragmentWidgetPriority: priority,
      fragmentWidgetHydrated: 'false'
    }
    this.propsNode = propsNode
    this.rect = {
      top: rect.top ?? 0,
      right: rect.right ?? 320,
      bottom: rect.bottom ?? 180,
      left: rect.left ?? 0,
      width: rect.width ?? 320,
      height: rect.height ?? 180
    }
  }

  matches(selector: string) {
    return selector === FRAGMENT_WIDGET_SELECTOR
  }

  closest(selector: string) {
    return this.matches(selector) ? this : null
  }

  querySelector(selector: string) {
    if (selector === FRAGMENT_WIDGET_PROPS_SELECTOR) {
      return this.propsNode
    }
    return null
  }

  querySelectorAll(_selector: string) {
    return []
  }

  getBoundingClientRect() {
    return this.rect
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

const createWidgetRoot = (
  priority: 'critical' | 'visible' | 'deferred' = 'visible',
  rect?: ConstructorParameters<typeof MockWidgetElement>[2]
) => {
  const widget = new MockWidgetElement(priority, new MockScriptElement('{}'), rect)
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
  const originalInnerWidth = globalThis.innerWidth
  const originalInnerHeight = globalThis.innerHeight
  const originalConsoleWarn = console.warn

  beforeEach(() => {
    MockIntersectionObserver.instances = []
    console.warn = () => undefined
    globalThis.innerWidth = 1280
    globalThis.innerHeight = 900
  })

  afterEach(() => {
    MockIntersectionObserver.instances = []
    globalThis.IntersectionObserver = originalIntersectionObserver
    globalThis.requestAnimationFrame = originalRequestAnimationFrame
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame
    globalThis.innerWidth = originalInnerWidth
    globalThis.innerHeight = originalInnerHeight
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

    const { root, widget } = createWidgetRoot('visible', {
      top: 2000,
      bottom: 2180
    })
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

  it('attaches visible widgets immediately when they already intersect the viewport', async () => {
    let scheduledPaintCallback: FrameRequestCallback | null = null
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      scheduledPaintCallback = callback
      return 1
    }) as typeof requestAnimationFrame
    globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame

    const { root, widget } = createWidgetRoot('visible', {
      top: 24,
      bottom: 164
    })
    const runtime = createFragmentWidgetRuntime({ root: root as unknown as ParentNode })

    expect(widget.dataset.fragmentWidgetHydrated).toBe('false')
    expect(typeof scheduledPaintCallback).toBe('function')

    scheduledPaintCallback?.(16.7)
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

  it('parses widget props from template markup when template textContent is empty', async () => {
    let scheduledPaintCallback: FrameRequestCallback | null = null
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      scheduledPaintCallback = callback
      return 1
    }) as typeof requestAnimationFrame
    globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame

    const widget = new MockWidgetElement(
      'critical',
      new MockTemplateElement('{"props":{"inviteId":"abc"}}')
    )
    const root = new MockRootElement([widget])
    const runtime = createFragmentWidgetRuntime({ root: root as unknown as ParentNode })

    scheduledPaintCallback?.(16.7)
    await flushMicrotasks()

    expect(widget.dataset.fragmentWidgetHydrated).toBe('true')

    runtime.destroy()
  })

  it('parses widget props from decoded template content when template markup is HTML-encoded', async () => {
    let scheduledPaintCallback: FrameRequestCallback | null = null
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      scheduledPaintCallback = callback
      return 1
    }) as typeof requestAnimationFrame
    globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame

    const widget = new MockWidgetElement(
      'critical',
      new MockTemplateElement(
        '{&quot;props&quot;:{&quot;inviteId&quot;:&quot;abc&quot;}}',
        '{"props":{"inviteId":"abc"}}'
      )
    )
    const root = new MockRootElement([widget])
    const runtime = createFragmentWidgetRuntime({ root: root as unknown as ParentNode })

    scheduledPaintCallback?.(16.7)
    await flushMicrotasks()

    expect(widget.dataset.fragmentWidgetHydrated).toBe('true')

    runtime.destroy()
  })
})
