import { afterEach, describe, expect, it } from 'bun:test'
import { installHomeDemoEntry } from './home-demo-entry'
import {
  STATIC_HOME_DATA_SCRIPT_ID,
  STATIC_SHELL_SEED_SCRIPT_ID
} from './constants'
import type { HomeDemoActivationManager, HomeDemoController } from './home-demo-controller'
import { normalizeHomeDemoAssetMap } from './home-demo-runtime-types'
import {
  clearHomeDemoControllerBinding,
  getHomeDemoControllerBinding,
  setHomeDemoControllerBinding
} from './home-demo-controller-state'

class MockScriptElement {
  constructor(readonly textContent: string) {}
}

class MockDocument {
  constructor(private readonly scripts: Map<string, MockScriptElement>) {}

  getElementById(id: string) {
    return this.scripts.get(id) ?? null
  }

  querySelectorAll() {
    return []
  }
}

type MockWindow = Window & {
  __PROM_STATIC_HOME_DEMO_ENTRY__?: boolean
  __PROM_STATIC_HOME_DEMO_CONTROLLER__?: ReturnType<typeof getHomeDemoControllerBinding>
}

const createBootstrapDocument = () =>
  new MockDocument(
    new Map([
      [
        STATIC_SHELL_SEED_SCRIPT_ID,
        new MockScriptElement(
          JSON.stringify({
            currentPath: '/',
            snapshotKey: '/',
            isAuthenticated: false,
            lang: 'en',
            languageSeed: {}
          })
        )
      ],
      [
        STATIC_HOME_DATA_SCRIPT_ID,
        new MockScriptElement(
          JSON.stringify({
            path: '/',
            lang: 'en',
            fragmentOrder: [],
            fragmentVersions: {},
            languageSeed: {},
            homeDemoAssets: {}
          })
        )
      ]
    ])
  )

const createController = (): HomeDemoController => ({
  path: '/',
  lang: 'en',
  fragmentOrder: [],
  planSignature: 'plan:test',
  versionSignature: 'version:test',
  assets: normalizeHomeDemoAssetMap(),
  demoRenders: new Map(),
  pendingDemoRoots: new Set(),
  destroyed: false
})

afterEach(() => {
  clearHomeDemoControllerBinding()
})

describe('installHomeDemoEntry', () => {
  it('reuses an existing singleton controller binding instead of creating another one', () => {
    const win = {} as MockWindow
    const doc = createBootstrapDocument()
    const observedRoots: ParentNode[] = []
    const existingBinding = setHomeDemoControllerBinding(
      {
        controller: createController(),
        manager: {
          observeWithin: (root) => observedRoots.push(root),
          destroy: () => undefined
        } satisfies HomeDemoActivationManager
      },
      win
    )

    const cleanup = installHomeDemoEntry({
      win,
      doc: doc as never
    })

    expect(observedRoots).toEqual([doc as unknown as ParentNode])
    expect(getHomeDemoControllerBinding(win)).toBe(existingBinding)

    cleanup()

    expect(win.__PROM_STATIC_HOME_DEMO_ENTRY__).toBe(false)
    expect(getHomeDemoControllerBinding(win)).toBe(existingBinding)
  })

  it('creates and clears the singleton controller binding when no binding exists yet', () => {
    const win = {} as MockWindow
    const doc = createBootstrapDocument()

    const cleanup = installHomeDemoEntry({
      win,
      doc: doc as never
    })

    const binding = getHomeDemoControllerBinding(win)
    expect(binding).not.toBeNull()
    expect(binding?.controller.path).toBe('/')
    expect(win.__PROM_STATIC_HOME_DEMO_ENTRY__).toBe(true)

    cleanup()

    expect(win.__PROM_STATIC_HOME_DEMO_ENTRY__).toBe(false)
    expect(getHomeDemoControllerBinding(win)).toBeNull()
  })
})
