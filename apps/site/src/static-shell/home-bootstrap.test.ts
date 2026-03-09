import { describe, expect, it } from 'bun:test'
import {
  activateHomeDemos,
  pruneDetachedHomeDemos,
  type HomeDemoController
} from './home-bootstrap'

class MockDemoElement {
  dataset: Record<string, string> = {}
  isConnected = true
  private attrs = new Map<string, string>()

  constructor(kind: string, props?: Record<string, unknown>) {
    this.dataset.homeDemoRoot = kind
    this.dataset.demoKind = kind
    if (props) {
      this.setAttribute('data-demo-props', JSON.stringify(props))
    }
  }

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null
  }

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value)
  }
}

class MockRoot {
  constructor(private readonly demoRoots: MockDemoElement[]) {}

  querySelectorAll<T>() {
    return this.demoRoots as unknown as T[]
  }
}

const createController = (): HomeDemoController => ({
  demoRenders: new Map(),
  pendingDemoRoots: new Set(),
  destroyed: false
})

describe('activateHomeDemos', () => {
  it('activates home demos in DOM order on initial bootstrap', async () => {
    const activations: Array<{ kind: string; props: Record<string, unknown> }> = []
    const controller = createController()
    const planner = new MockDemoElement('planner')
    const island = new MockDemoElement('preact-island', { label: 'Mission clock' })

    await activateHomeDemos(controller, {
      root: new MockRoot([planner, island]) as unknown as ParentNode,
      activate: async ({ kind, props }) => {
        activations.push({ kind, props })
        return { cleanup: () => undefined }
      }
    })

    expect(activations).toEqual([
      { kind: 'planner', props: {} },
      { kind: 'preact-island', props: { label: 'Mission clock' } }
    ])
    expect(controller.demoRenders.size).toBe(2)
  })

  it('does not activate the same root twice on repeated bootstrap passes', async () => {
    const controller = createController()
    const planner = new MockDemoElement('planner')
    let activationCount = 0

    const activate = async () => {
      activationCount += 1
      return { cleanup: () => undefined }
    }

    const root = new MockRoot([planner]) as unknown as ParentNode
    await activateHomeDemos(controller, { root, activate })
    await activateHomeDemos(controller, { root, activate })

    expect(activationCount).toBe(1)
    expect(controller.demoRenders.size).toBe(1)
  })

  it('cleans up detached demos and activates replacement roots after a patch', async () => {
    const cleanups: string[] = []
    const activations: string[] = []
    const controller = createController()
    const oldPlanner = new MockDemoElement('planner')

    await activateHomeDemos(controller, {
      root: new MockRoot([oldPlanner]) as unknown as ParentNode,
      activate: async ({ kind }) => {
        activations.push(kind)
        return { cleanup: () => cleanups.push(`cleanup:${kind}:old`) }
      }
    })

    oldPlanner.isConnected = false
    const newPlanner = new MockDemoElement('planner')

    await activateHomeDemos(controller, {
      root: new MockRoot([newPlanner]) as unknown as ParentNode,
      activate: async ({ kind }) => {
        activations.push(kind)
        return { cleanup: () => cleanups.push(`cleanup:${kind}:new`) }
      }
    })

    expect(activations).toEqual(['planner', 'planner'])
    expect(cleanups).toEqual(['cleanup:planner:old'])
    expect(controller.demoRenders.has(oldPlanner as unknown as Element)).toBe(false)
    expect(controller.demoRenders.has(newPlanner as unknown as Element)).toBe(true)
  })

  it('re-activates replacement roots after a language-swap style DOM replacement', async () => {
    const activations: Array<{ kind: string; props: Record<string, unknown> }> = []
    const controller = createController()
    const englishIsland = new MockDemoElement('preact-island', { label: 'Mission clock' })

    await activateHomeDemos(controller, {
      root: new MockRoot([englishIsland]) as unknown as ParentNode,
      activate: async ({ kind, props }) => {
        activations.push({ kind, props })
        return { cleanup: () => undefined }
      }
    })

    englishIsland.isConnected = false
    pruneDetachedHomeDemos(controller)

    const japaneseIsland = new MockDemoElement('preact-island', { label: 'Orbital timer' })
    await activateHomeDemos(controller, {
      root: new MockRoot([japaneseIsland]) as unknown as ParentNode,
      activate: async ({ kind, props }) => {
        activations.push({ kind, props })
        return { cleanup: () => undefined }
      }
    })

    expect(activations).toEqual([
      { kind: 'preact-island', props: { label: 'Mission clock' } },
      { kind: 'preact-island', props: { label: 'Orbital timer' } }
    ])
    expect(controller.demoRenders.has(japaneseIsland as unknown as Element)).toBe(true)
  })
})
