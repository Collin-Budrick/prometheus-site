import { afterEach, describe, expect, it } from "bun:test";
import { installHomeDemoEntry } from "./home-demo-entry";
import {
  STATIC_HOME_DATA_SCRIPT_ID,
  STATIC_SHELL_SEED_SCRIPT_ID,
} from "./constants";
import type {
  HomeDemoActivationManager,
  HomeDemoController,
} from "./home-demo-controller";
import { dispatchHomeDemoObserveEvent } from "./home-demo-observe-event";
import { normalizeHomeDemoAssetMap } from "./home-demo-runtime-types";
import {
  clearHomeDemoControllerBinding,
  getHomeDemoControllerBinding,
  setHomeDemoControllerBinding,
} from "./home-demo-controller-state";

class MockScriptElement {
  constructor(readonly textContent: string) {}
}

class MockDocument {
  private readonly listeners = new Map<string, Set<(event: Event) => void>>();

  constructor(private readonly scripts: Map<string, MockScriptElement>) {}

  getElementById(id: string) {
    return this.scripts.get(id) ?? null;
  }

  querySelectorAll() {
    return [];
  }

  addEventListener(type: string, listener: (event: Event) => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: Event) => void) {
    const listeners = this.listeners.get(type);
    if (!listeners) return;
    listeners.delete(listener);
    if (listeners.size === 0) {
      this.listeners.delete(type);
    }
  }

  dispatchEvent(event: Event) {
    this.listeners.get(event.type)?.forEach((listener) => listener(event));
    return true;
  }

  setScriptText(id: string, textContent: string) {
    this.scripts.set(id, new MockScriptElement(textContent));
  }
}

type MockWindow = Window & {
  __PROM_STATIC_HOME_DEMO_ENTRY__?: boolean;
  __PROM_STATIC_HOME_DEMO_CONTROLLER__?: ReturnType<
    typeof getHomeDemoControllerBinding
  >;
};

const createBootstrapDocument = () =>
  new MockDocument(
    new Map([
      [
        STATIC_SHELL_SEED_SCRIPT_ID,
        new MockScriptElement(
          JSON.stringify({
            currentPath: "/",
            snapshotKey: "/",
            isAuthenticated: false,
            lang: "en",
            languageSeed: {},
          }),
        ),
      ],
      [
        STATIC_HOME_DATA_SCRIPT_ID,
        new MockScriptElement(
          JSON.stringify({
            path: "/",
            lang: "en",
            fragmentOrder: [],
            fragmentVersions: {},
            languageSeed: {},
            homeDemoAssets: {},
          }),
        ),
      ],
    ]),
  );

const createController = (): HomeDemoController => ({
  path: "/",
  lang: "en",
  fragmentOrder: [],
  planSignature: "plan:test",
  versionSignature: "version:test",
  assets: normalizeHomeDemoAssetMap(),
  demoRenders: new Map(),
  pendingDemoRoots: new Set(),
  destroyed: false,
});

const createScheduledTaskQueue = () => {
  const callbacks: Array<() => void> = [];

  return {
    scheduleTask(callback: () => void) {
      callbacks.push(callback);
      return () => {
        const index = callbacks.indexOf(callback);
        if (index >= 0) {
          callbacks.splice(index, 1);
        }
      };
    },
    runNext() {
      const callback = callbacks.shift();
      callback?.();
    },
    size() {
      return callbacks.length;
    },
  };
};

afterEach(() => {
  clearHomeDemoControllerBinding();
});

describe("installHomeDemoEntry", () => {
  it("reuses an existing singleton controller binding instead of creating another one", () => {
    const win = {} as MockWindow;
    const doc = createBootstrapDocument();
    const taskQueue = createScheduledTaskQueue();
    const observedRoots: ParentNode[] = [];
    const existingBinding = setHomeDemoControllerBinding(
      {
        controller: createController(),
        manager: {
          observeWithin: (root) => observedRoots.push(root),
          destroy: () => undefined,
        } satisfies HomeDemoActivationManager,
      },
      win,
    );

    const cleanup = installHomeDemoEntry({
      win,
      doc: doc as never,
      scheduleTask: taskQueue.scheduleTask as never,
    });

    expect(observedRoots).toEqual([]);
    expect(taskQueue.size()).toBe(1);

    taskQueue.runNext();

    expect(observedRoots).toEqual([doc as unknown as ParentNode]);
    expect(getHomeDemoControllerBinding(win)).toBe(existingBinding);

    cleanup();

    expect(win.__PROM_STATIC_HOME_DEMO_ENTRY__).toBe(false);
    expect(getHomeDemoControllerBinding(win)).toBe(existingBinding);
  });

  it("creates and clears the singleton controller binding when no binding exists yet", () => {
    const win = {} as MockWindow;
    const doc = createBootstrapDocument();
    const taskQueue = createScheduledTaskQueue();

    const cleanup = installHomeDemoEntry({
      win,
      doc: doc as never,
      scheduleTask: taskQueue.scheduleTask as never,
    });

    const binding = getHomeDemoControllerBinding(win);
    expect(binding).not.toBeNull();
    expect(binding?.controller.path).toBe("/");
    expect(win.__PROM_STATIC_HOME_DEMO_ENTRY__).toBe(true);
    expect(taskQueue.size()).toBe(1);

    cleanup();

    expect(win.__PROM_STATIC_HOME_DEMO_ENTRY__).toBe(false);
    expect(getHomeDemoControllerBinding(win)).toBeNull();
  });

  it("re-observes patched roots via the internal bootstrap event and syncs route context", () => {
    const win = {} as MockWindow;
    const doc = createBootstrapDocument();
    const taskQueue = createScheduledTaskQueue();
    const observedRoots: ParentNode[] = [];
    const binding = setHomeDemoControllerBinding(
      {
        controller: createController(),
        manager: {
          observeWithin: (root) => observedRoots.push(root),
          destroy: () => undefined,
        } satisfies HomeDemoActivationManager,
      },
      win,
    );

    const cleanup = installHomeDemoEntry({
      win,
      doc: doc as never,
      scheduleTask: taskQueue.scheduleTask as never,
    });

    expect(observedRoots).toEqual([]);
    taskQueue.runNext();

    doc.setScriptText(
      STATIC_HOME_DATA_SCRIPT_ID,
      JSON.stringify({
        path: "/",
        lang: "ja",
        fragmentOrder: ["fragment://page/home/planner@v2"],
        fragmentVersions: {},
        languageSeed: {},
        planSignature: "plan:next",
        versionSignature: "version:next",
        homeDemoAssets: {
          planner: {
            moduleHref: "/build/home-demo-planner-runtime.js",
            styleHref: null,
          },
        },
      }),
    );

    const patchedRoot = {} as ParentNode;
    dispatchHomeDemoObserveEvent({
      root: patchedRoot,
      doc: doc as never,
    });

    expect(observedRoots).toEqual([doc as unknown as ParentNode, patchedRoot]);
    expect(binding.controller.lang).toBe("ja");
    expect(binding.controller.fragmentOrder).toEqual([
      "fragment://page/home/planner@v2",
    ]);
    expect(binding.controller.planSignature).toBe("plan:next");
    expect(binding.controller.versionSignature).toBe("version:next");
    expect(binding.controller.assets.planner.moduleHref).toBe(
      "/build/home-demo-planner-runtime.js",
    );

    cleanup();
  });
});
