import { afterEach, describe, expect, it } from 'bun:test'
import { installHomeStaticEntry } from './home-post-anchor-core'
import { STATIC_HOME_DATA_SCRIPT_ID, STATIC_SHELL_SEED_SCRIPT_ID } from '../core/constants'

type MockListener = (event?: { target?: unknown }) => void
type ListenerMap = Map<string, Set<MockListener>>

class MockScriptElement {
  constructor(readonly textContent: string) {}
}

class MockWindow {
  __PROM_STATIC_HOME_ENTRY__?: boolean
  readonly listeners: ListenerMap = new Map()

  addEventListener(type: string, listener: MockListener) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: MockListener) {
    const listeners = this.listeners.get(type)
    if (!listeners) {
      return
    }
    listeners.delete(listener)
    if (listeners.size === 0) {
      this.listeners.delete(type)
    }
  }

  emit(type: string, event?: { target?: unknown }) {
    ;(this.listeners.get(type) ?? new Set()).forEach((listener) => listener(event))
  }
}

class MockDocument {
  readonly listeners: ListenerMap = new Map()
  activeElement: unknown = null
  readonly mainRoot = { kind: 'main-root' }
  readonly homeRoot = { kind: 'home-root' }
  visibilityState: 'visible' | 'hidden' = 'visible'

  addEventListener(type: string, listener: MockListener) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: MockListener) {
    const listeners = this.listeners.get(type)
    if (!listeners) {
      return
    }
    listeners.delete(listener)
    if (listeners.size === 0) {
      this.listeners.delete(type)
    }
  }

  emit(type: string, event?: { target?: unknown }) {
    ;(this.listeners.get(type) ?? new Set()).forEach((listener) => listener(event))
  }

  getElementById(id: string) {
    if (id === STATIC_SHELL_SEED_SCRIPT_ID) {
      return new MockScriptElement(
        JSON.stringify({
          currentPath: '/',
          snapshotKey: '/',
          isAuthenticated: false,
          lang: 'en',
          languageSeed: {}
        })
      )
    }

    if (id === STATIC_HOME_DATA_SCRIPT_ID) {
      return new MockScriptElement(
        JSON.stringify({
          path: '/',
          lang: 'en',
          fragmentBootstrapHref: '/api/fragments/bootstrap?protocol=2&lang=en&ids=fragment://page/home/manifest@v1',
          fragmentOrder: ['fragment://page/home/manifest@v1'],
          runtimePlanEntries: [
            {
              id: 'fragment://page/home/manifest@v1',
              critical: true,
              layout: {},
              dependsOn: []
            }
          ],
          runtimeFetchGroups: [[0]],
          runtimeInitialFragments: [],
          fragmentVersions: {},
          languageSeed: {},
          homeDemoAssets: {
            planner: '/build/static-shell/apps/site/src/shell/home/home-demo-planner-runtime.js'
          }
        })
      )
    }

    return null
  }

  querySelector(selector: string) {
    if (selector === '[data-static-shell-region="main"]') {
      return this.mainRoot
    }
    if (selector === '[data-static-home-root]') {
      return this.homeRoot
    }
    return null
  }
}

const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const createTaskQueue = () => {
  const tasks: Array<{ callback: () => void; cancelled: boolean }> = []

  return {
    schedule(callback: () => void) {
      const task = { callback, cancelled: false }
      tasks.push(task)
      return () => {
        task.cancelled = true
      }
    },
    flush() {
      const pending = tasks.splice(0)
      pending.forEach((task) => {
        if (!task.cancelled) {
          task.callback()
        }
      })
    }
  }
}

afterEach(() => {
  // no-op placeholder so each test gets a fresh document/window instance
})

describe('installHomeStaticEntry', () => {
  it('resumes hydration immediately and schedules deferred home work through idle tasks', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    const taskQueue = createTaskQueue()
    const scheduledOptions: Array<Record<string, unknown> | undefined> = []
    let deferredRuntimeLoads = 0
    let deferredRuntimeInstalls = 0
    let resumeCalls = 0
    let globalStyleCallCount = 0
    let widgetRuntimeLoads = 0
    let widgetRuntimeCreates = 0

    const cleanup = installHomeStaticEntry({
      win: win as never,
      doc: doc as never,
      scheduleTask: ((callback: () => void, options?: Record<string, unknown>) => {
        scheduledOptions.push(options)
        return taskQueue.schedule(callback)
      }) as never,
      loadDeferredRuntime: async () => {
        deferredRuntimeLoads += 1
        return {
          installHomeBootstrapDeferredRuntime: async () => {
            deferredRuntimeInstalls += 1
          }
        } as never
      },
      resumeDeferredHydration: ({ root, previewRefresh }) => {
        resumeCalls += 1
        expect(root).toBe(doc)
        expect(previewRefresh).toBeUndefined()
        return true
      },
      loadWidgetRuntime: async () => {
        widgetRuntimeLoads += 1
        return {
          createFragmentWidgetRuntime: ({ root, observeMutations }: { root: unknown; observeMutations: boolean }) => {
            widgetRuntimeCreates += 1
            expect(root).toBe(doc.mainRoot)
            expect(observeMutations).toBe(true)
            return {
              handleInteraction() {},
              destroy() {}
            }
          }
        } as never
      },
      ensureDeferredGlobalStylesheet: async ({ doc: liveDoc }) => {
        globalStyleCallCount += 1
        expect(liveDoc).toBe(doc)
      }
    })

    await flushMicrotasks()

    expect(resumeCalls).toBe(1)
    expect(deferredRuntimeLoads).toBe(0)
    expect(deferredRuntimeInstalls).toBe(0)
    expect(globalStyleCallCount).toBe(0)
    expect(win.listeners.has('pointerdown')).toBe(true)
    expect(win.listeners.has('keydown')).toBe(true)
    expect(win.listeners.has('touchstart')).toBe(true)
    expect(win.listeners.has('pagehide')).toBe(true)
    expect(doc.listeners.has('focusin')).toBe(true)
    expect(doc.listeners.has('visibilitychange')).toBe(true)
    expect(scheduledOptions).toEqual([
      expect.objectContaining({
        priority: 'user-visible',
        preferIdle: true,
        waitForPaint: true,
        timeoutMs: 250
      }),
      expect.objectContaining({
        preferIdle: true,
        waitForLoad: true,
        waitForPaint: true,
        timeoutMs: 5000
      }),
      expect.objectContaining({
        preferIdle: true,
        waitForPaint: true,
        timeoutMs: 1500
      })
    ])

    taskQueue.flush()
    await flushMicrotasks()

    expect(globalStyleCallCount).toBe(1)
    expect(widgetRuntimeLoads).toBe(1)
    expect(widgetRuntimeCreates).toBe(1)
    expect(deferredRuntimeLoads).toBe(1)
    expect(deferredRuntimeInstalls).toBe(1)

    cleanup()

    expect(win.listeners.size).toBe(0)
    expect(doc.listeners.size).toBe(0)
    expect(win.__PROM_STATIC_HOME_ENTRY__).toBe(false)
  })

  it('cancels deferred static work when the page becomes hidden before idle work runs', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    const taskQueue = createTaskQueue()
    let globalStyleCallCount = 0
    let deferredRuntimeLoads = 0
    let widgetRuntimeLoads = 0

    const cleanup = installHomeStaticEntry({
      win: win as never,
      doc: doc as never,
      scheduleTask: taskQueue.schedule as never,
      loadDeferredRuntime: async () => {
        deferredRuntimeLoads += 1
        return {
          installHomeBootstrapDeferredRuntime: async () => undefined
        } as never
      },
      resumeDeferredHydration: () => true,
      loadWidgetRuntime: async () => {
        widgetRuntimeLoads += 1
        return {
          createFragmentWidgetRuntime: () => ({
            handleInteraction() {},
            destroy() {}
          })
        } as never
      },
      ensureDeferredGlobalStylesheet: async () => {
        globalStyleCallCount += 1
      }
    })

    doc.visibilityState = 'hidden'
    doc.emit('visibilitychange')
    win.emit('pagehide')
    taskQueue.flush()
    await flushMicrotasks()

    expect(globalStyleCallCount).toBe(0)
    expect(widgetRuntimeLoads).toBe(0)
    expect(deferredRuntimeLoads).toBe(1)

    cleanup()
  })

  it('starts the widget runtime automatically after first paint without waiting for interaction', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    const taskQueue = createTaskQueue()
    let loadWidgetRuntimeCalls = 0
    let createRuntimeCalls = 0

    const cleanup = installHomeStaticEntry({
      win: win as never,
      doc: doc as never,
      scheduleTask: taskQueue.schedule as never,
      loadDeferredRuntime: async () => ({
        installHomeBootstrapDeferredRuntime: async () => undefined
      }) as never,
      resumeDeferredHydration: () => true,
      loadWidgetRuntime: async () => {
        loadWidgetRuntimeCalls += 1
        return {
          createFragmentWidgetRuntime: ({
            root,
            observeMutations
          }: {
            root: unknown
            observeMutations: boolean
          }) => {
            createRuntimeCalls += 1
            expect(root).toBe(doc.mainRoot)
            expect(observeMutations).toBe(true)
            return {
              handleInteraction() {},
              destroy() {}
            }
          }
        } as never
      }
    })

    taskQueue.flush()
    await flushMicrotasks()

    expect(loadWidgetRuntimeCalls).toBe(1)
    expect(createRuntimeCalls).toBe(1)

    cleanup()
  })

  it('starts the widget runtime on fragment-card pointer interaction and reuses it', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    const handledTargets: unknown[] = []
    let loadWidgetRuntimeCalls = 0
    let createRuntimeCalls = 0
    let destroyCalls = 0

    const runtime = {
      handleInteraction(target: EventTarget | null) {
        handledTargets.push(target)
      },
      destroy() {
        destroyCalls += 1
      }
    }

    const cleanup = installHomeStaticEntry({
      win: win as never,
      doc: doc as never,
      scheduleTask: (() => () => undefined) as never,
      loadDeferredRuntime: async () => ({
        installHomeBootstrapDeferredRuntime: async () => undefined
      }) as never,
      resumeDeferredHydration: () => true,
      loadWidgetRuntime: async () => {
        loadWidgetRuntimeCalls += 1
        return {
          createFragmentWidgetRuntime: ({
            root,
            observeMutations
          }: {
            root: unknown
            observeMutations: boolean
          }) => {
            createRuntimeCalls += 1
            expect(root).toBe(doc.mainRoot)
            expect(observeMutations).toBe(true)
            return runtime
          }
        } as never
      }
    })

    const fragmentCardTarget = {
      closest: (selector: string) => (selector === '[data-static-fragment-card]' ? {} : null)
    }

    win.emit('pointerdown', { target: fragmentCardTarget })
    await flushMicrotasks()
    win.emit('pointerdown', { target: fragmentCardTarget })
    await flushMicrotasks()

    expect(loadWidgetRuntimeCalls).toBe(1)
    expect(createRuntimeCalls).toBe(1)
    expect(handledTargets).toEqual([fragmentCardTarget, fragmentCardTarget])

    cleanup()

    expect(destroyCalls).toBe(1)
  })

  it('routes focus and keyboard interactions through the widget runtime only for fragment cards', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    const handledTargets: unknown[] = []
    let loadWidgetRuntimeCalls = 0

    const cleanup = installHomeStaticEntry({
      win: win as never,
      doc: doc as never,
      scheduleTask: (() => () => undefined) as never,
      loadDeferredRuntime: async () => ({
        installHomeBootstrapDeferredRuntime: async () => undefined
      }) as never,
      resumeDeferredHydration: () => true,
      loadWidgetRuntime: async () => {
        loadWidgetRuntimeCalls += 1
        return {
          createFragmentWidgetRuntime: () => ({
            handleInteraction(target: EventTarget | null) {
              handledTargets.push(target)
            },
            destroy() {}
          })
        } as never
      }
    })

    doc.activeElement = {
      closest: () => null
    }
    win.emit('keydown')
    await flushMicrotasks()

    const keyboardTarget = {
      closest: (selector: string) => (selector === '[data-static-fragment-card]' ? {} : null)
    }
    doc.activeElement = keyboardTarget
    win.emit('keydown')
    await flushMicrotasks()

    const focusTarget = {
      closest: (selector: string) => (selector === '[data-static-fragment-card]' ? {} : null)
    }
    doc.emit('focusin', { target: focusTarget })
    await flushMicrotasks()

    expect(loadWidgetRuntimeCalls).toBe(1)
    expect(handledTargets).toEqual([keyboardTarget, focusTarget])

    cleanup()
  })

  it('replays the first click after widget hydration finishes', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    const widget = {
      dataset: {
        fragmentWidgetHydrated: 'false'
      }
    }
    let loadWidgetRuntimeCalls = 0
    let prevented = false
    let stopped = false

    const interactiveTarget = {
      isConnected: true,
      clickCalls: 0,
      click() {
        this.clickCalls += 1
      },
      closest(selector: string) {
        if (selector === '[data-static-fragment-card]') {
          return {}
        }
        if (selector === '[data-fragment-widget]') {
          return widget
        }
        if (selector.includes('button')) {
          return interactiveTarget
        }
        return null
      }
    }

    const cleanup = installHomeStaticEntry({
      win: win as never,
      doc: doc as never,
      scheduleTask: (() => () => undefined) as never,
      loadDeferredRuntime: async () => ({
        installHomeBootstrapDeferredRuntime: async () => undefined
      }) as never,
      resumeDeferredHydration: () => true,
      loadWidgetRuntime: async () => {
        loadWidgetRuntimeCalls += 1
        return {
          createFragmentWidgetRuntime: () => ({
            handleInteraction() {
              widget.dataset.fragmentWidgetHydrated = 'true'
            },
            destroy() {}
          })
        } as never
      }
    })

    win.emit('pointerdown', { target: interactiveTarget })
    win.emit('click', {
      target: interactiveTarget,
      preventDefault() {
        prevented = true
      },
      stopImmediatePropagation() {
        stopped = true
      }
    })

    await flushMicrotasks()
    await new Promise((resolve) => setTimeout(resolve, 40))

    expect(loadWidgetRuntimeCalls).toBe(1)
    expect(prevented).toBe(true)
    expect(stopped).toBe(true)
    expect(interactiveTarget.clickCalls).toBe(1)

    cleanup()
  })
})
