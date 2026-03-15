import { describe, expect, it } from "bun:test";

import {
  bindOverlayDismiss,
  focusOverlayEntry,
  restoreOverlayFocus,
  restoreOverlayFocusBeforeHide,
  setOverlaySurfaceState,
} from "./overlay-a11y";

class MockDocument {
  activeElement: unknown = null;
}

class MockElement {
  dataset: Record<string, string> = {};
  hidden = false;
  inert = false;
  isConnected = true;
  tabIndex = -1;
  focusCount = 0;
  blurCount = 0;
  ownerDocument: MockDocument | null = null;
  private readonly attrs = new Map<string, string>();
  private readonly queries = new Map<string, MockElement | null>();
  private readonly contained = new Set<unknown>([this]);

  setQuery(selector: string, element: MockElement | null) {
    this.queries.set(selector, element);
    if (element) {
      this.include(element);
    }
  }

  include(element: unknown) {
    this.contained.add(element);
  }

  querySelector<T>(selector: string) {
    return (this.queries.get(selector) ?? null) as T | null;
  }

  contains(target: unknown) {
    return this.contained.has(target);
  }

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value);
  }

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null;
  }

  removeAttribute(name: string) {
    this.attrs.delete(name);
  }

  focus() {
    this.focusCount += 1;
    if (this.ownerDocument) {
      this.ownerDocument.activeElement = this;
    }
  }

  blur() {
    this.blurCount += 1;
    if (this.ownerDocument?.activeElement === this) {
      this.ownerDocument.activeElement = null;
    }
  }
}

type MockListener = (event: Event) => void;

class MockEventTarget {
  private readonly listeners = new Map<string, Set<MockListener>>();

  addEventListener(type: string, listener: MockListener) {
    const listeners = this.listeners.get(type) ?? new Set<MockListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: MockListener) {
    const listeners = this.listeners.get(type);
    if (!listeners) return;
    listeners.delete(listener);
    if (listeners.size === 0) {
      this.listeners.delete(type);
    }
  }

  emit(type: string, event: Event) {
    (this.listeners.get(type) ?? new Set()).forEach((listener) =>
      listener(event),
    );
  }
}

describe("overlay a11y helpers", () => {
  it("manages the interactive shell settings panel hidden state and focus flow", () => {
    const doc = new MockDocument();
    const trigger = new MockElement();
    const panel = new MockElement();
    const languageToggle = new MockElement();
    trigger.ownerDocument = doc;
    panel.ownerDocument = doc;
    languageToggle.ownerDocument = doc;

    panel.setQuery(".settings-lang-trigger", languageToggle);

    setOverlaySurfaceState(panel as unknown as HTMLElement, false);

    expect(panel.hidden).toBe(true);
    expect(panel.inert).toBe(true);
    expect(panel.getAttribute("aria-hidden")).toBe("true");

    setOverlaySurfaceState(panel as unknown as HTMLElement, true);
    focusOverlayEntry(
      panel as unknown as HTMLElement,
      ".settings-lang-trigger",
    );
    restoreOverlayFocus(trigger as unknown as HTMLElement);

    expect(panel.hidden).toBe(false);
    expect(panel.inert).toBe(false);
    expect(panel.getAttribute("aria-hidden")).toBe("false");
    expect(languageToggle.focusCount).toBe(1);
    expect(trigger.focusCount).toBe(1);
  });

  it("moves focus out of an overlay before it is hidden", () => {
    const doc = new MockDocument();
    const trigger = new MockElement();
    const panel = new MockElement();
    const focusedInput = new MockElement();
    trigger.ownerDocument = doc;
    panel.ownerDocument = doc;
    focusedInput.ownerDocument = doc;
    panel.include(focusedInput);

    focusedInput.focus();
    restoreOverlayFocusBeforeHide(
      panel as unknown as HTMLElement,
      trigger as unknown as HTMLElement,
    );
    setOverlaySurfaceState(panel as unknown as HTMLElement, false);

    expect(trigger.focusCount).toBe(1);
    expect(focusedInput.blurCount).toBe(0);
    expect(doc.activeElement).toBe(trigger);
    expect(panel.getAttribute("aria-hidden")).toBe("true");
  });

  it("blurs a focused descendant when an overlay is hidden without an explicit focus restore", () => {
    const doc = new MockDocument();
    const panel = new MockElement();
    const focusedInput = new MockElement();
    panel.ownerDocument = doc;
    focusedInput.ownerDocument = doc;
    panel.include(focusedInput);

    focusedInput.focus();
    setOverlaySurfaceState(panel as unknown as HTMLElement, false);

    expect(focusedInput.blurCount).toBe(1);
    expect(doc.activeElement).toBeNull();
    expect(panel.hidden).toBe(true);
    expect(panel.getAttribute("aria-hidden")).toBe("true");
  });

  it("dismisses the static shell settings panel on Escape and ignores pointer events inside the root", () => {
    const root = new MockElement();
    const panel = new MockElement();
    const doc = new MockEventTarget();
    const win = new MockEventTarget();
    const reasons: string[] = [];
    let prevented = false;

    root.include(panel);

    const cleanup = bindOverlayDismiss({
      root: root as unknown as HTMLElement,
      doc: doc as unknown as Document,
      win: win as unknown as Window,
      onDismiss: (reason) => {
        reasons.push(reason);
      },
    });

    doc.emit("pointerdown", { target: panel } as PointerEvent);
    win.emit("keydown", {
      key: "Escape",
      preventDefault: () => {
        prevented = true;
      },
    } as KeyboardEvent);

    expect(reasons).toEqual(["escape"]);
    expect(prevented).toBe(true);

    cleanup();
  });

  it("prefers the checked store sort radio when the popup opens", () => {
    const panel = new MockElement();
    const checked = new MockElement();
    const fallback = new MockElement();

    panel.setQuery('input[name="store-stream-sort"]:checked', checked);
    panel.setQuery('input[name="store-stream-sort"]', fallback);

    focusOverlayEntry(panel as unknown as HTMLElement, [
      'input[name="store-stream-sort"]:checked',
      'input[name="store-stream-sort"]',
    ]);

    expect(checked.focusCount).toBe(1);
    expect(fallback.focusCount).toBe(0);
  });

  it("focuses the chat invites search field and dismisses only on outside pointer events", () => {
    const root = new MockElement();
    const popover = new MockElement();
    const searchInput = new MockElement();
    const outsideTarget = new MockElement();
    const doc = new MockEventTarget();
    const win = new MockEventTarget();
    const reasons: string[] = [];

    popover.setQuery('input[type="text"]', searchInput);
    root.include(popover);
    root.include(searchInput);

    focusOverlayEntry(popover as unknown as HTMLElement, 'input[type="text"]');

    const cleanup = bindOverlayDismiss({
      root: root as unknown as HTMLElement,
      doc: doc as unknown as Document,
      win: win as unknown as Window,
      onDismiss: (reason) => {
        reasons.push(reason);
      },
    });

    doc.emit("pointerdown", { target: searchInput } as PointerEvent);
    doc.emit("pointerdown", { target: outsideTarget } as PointerEvent);

    expect(searchInput.focusCount).toBe(1);
    expect(reasons).toEqual(["pointer"]);

    cleanup();
  });
});
