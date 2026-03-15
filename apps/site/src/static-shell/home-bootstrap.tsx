import type { Lang } from "../lang";
import type { LanguageSeedPayload } from "../lang/selection";
import { getStaticHomeUiCopy, seedStaticHomeCopy } from "./home-copy-store";
import { readStaticHomeBootstrapData } from "./home-bootstrap-data";
import { dispatchHomeDemoObserveEvent } from "./home-demo-observe-event";
import { ensureHomeDemoStylesheet } from "./home-demo-runtime-loader";
import {
  fetchHomeFragmentBatch,
  fetchHomeFragmentBootstrapSelection,
} from "./home-fragment-client";
import { isHomeFragmentBootstrapSubset } from "./home-fragment-bootstrap";
import {
  collectStaticHomeKnownVersions,
  createStaticHomePatchQueue,
  type StaticHomePatchQueue,
} from "./home-stream";
import {
  queueReadyStagger,
  READY_STAGGER_STATE_ATTR,
} from "@prometheus/ui/ready-stagger";
import { persistInitialFragmentCardHeights } from "./fragment-height";
import {
  STATIC_HOME_FRAGMENT_KIND_ATTR,
  STATIC_HOME_PAINT_ATTR,
  STATIC_HOME_PATCH_STATE_ATTR,
  STATIC_HOME_STAGE_ATTR,
} from "./constants";
import { loadClientAuthSession } from "./auth-client";
import { createHomeFirstLcpGate, type HomeFirstLcpGate } from "./home-lcp-gate";
import { scheduleStaticShellTask } from "./scheduler";
import { primeTrustedTypesPolicies } from "../security/client";
import {
  bindOverlayDismiss,
  focusOverlayEntry,
  restoreOverlayFocusBeforeHide,
  setOverlaySurfaceState,
} from "../shared/overlay-a11y";
import {
  staticDockRootNeedsSync,
  syncStaticDockRootState,
  writeStaticShellSeed,
} from "./seed-client";
import { loadStaticShellLanguageSeed } from "./language-seed-client";
import {
  applyStaticShellSnapshot,
  loadStaticShellSnapshot,
  resolvePreferredStaticShellLang,
  updateStaticShellUrlLang,
} from "./snapshot-client";
import type { StaticHomeCardStage } from "./constants";

type Theme = "light" | "dark";

type HomeControllerState = {
  isAuthenticated: boolean;
  lang: Lang;
  path: string;
  fragmentOrder: string[];
  planSignature: string;
  versionSignature: string;
  homeDemoStylesheetHref: string | null;
  homeFragmentBootstrapHref: string | null;
  fetchAbort: AbortController | null;
  cleanupFns: Array<() => void>;
  patchQueue: StaticHomePatchQueue | null;
  destroyed: boolean;
};

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const LEGACY_HOME_CLEANUP_SESSION_KEY = "prom-static-home-cleanup:v1";
const HOME_STABLE_HEIGHT_PREFIX = `fragment:stable-height:v1:${encodeURIComponent("/")}:`;
const LEGACY_HOME_STORAGE_KEYS = [
  "fragment:card-order:v1:/",
  "fragment:card-order:v1:columns:/",
  "fragment-critical:/:desktop",
  "fragment-critical:/:mobile",
];
const HOME_CRITICAL_COOKIE_KEYS = [
  "prom-frag-critical-m",
  "prom-frag-critical-d",
] as const;
const STATIC_THEME_STORAGE_KEY = "prometheus-theme";
const STATIC_THEME_COOKIE_KEY = "prometheus-theme";
const STATIC_THEME_PREFERENCE_KEY = "prometheus:pref:theme";
const STATIC_LANG_STORAGE_KEY = "prometheus-lang";
const STATIC_LANG_COOKIE_KEY = "prometheus-lang";
const STATIC_LANG_PREFERENCE_KEY = "prometheus:pref:locale";
const LIGHT_THEME_COLOR = "#f97316";
const DARK_THEME_COLOR = "#0f172a";

const createThemeIcon = (theme: Theme) => {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("class", "theme-toggle-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "1em");
  svg.setAttribute("height", "1em");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  const path = document.createElementNS(SVG_NAMESPACE, "path");
  path.setAttribute(
    "d",
    theme === "dark"
      ? "M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8Z"
      : "M21 12.8a9 9 0 1 1-9.8-9 7 7 0 0 0 9.8 9z",
  );
  svg.append(path);
  return svg;
};

let activeController: HomeControllerState | null = null;
let languageSwapInFlight = false;

const writeLocalStorageValue = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures in private mode.
  }
};

const setThemeCookie = (value: Theme) => {
  document.cookie = `${STATIC_THEME_COOKIE_KEY}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
};

const setLangCookie = (value: Lang) => {
  document.cookie = `${STATIC_LANG_COOKIE_KEY}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
};

const setDocumentTheme = (value: Theme) => {
  document.documentElement.dataset.theme = value;
  document.documentElement.style.colorScheme = value;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute(
      "content",
      value === "dark" ? DARK_THEME_COLOR : LIGHT_THEME_COLOR,
    );
  }
};

const persistStaticTheme = (value: Theme) => {
  setDocumentTheme(value);
  writeLocalStorageValue(STATIC_THEME_STORAGE_KEY, value);
  writeLocalStorageValue(STATIC_THEME_PREFERENCE_KEY, value);
  setThemeCookie(value);
};

const setDocumentLang = (value: Lang) => {
  document.documentElement.lang = value;
};

const persistStaticLang = (value: Lang) => {
  setDocumentLang(value);
  writeLocalStorageValue(STATIC_LANG_STORAGE_KEY, value);
  writeLocalStorageValue(STATIC_LANG_PREFERENCE_KEY, value);
  setLangCookie(value);
};

const readCookieValue = (key: string) => {
  const parts = document.cookie.split(";");
  for (const part of parts) {
    const [name, raw] = part.trim().split("=");
    if (name !== key) continue;
    if (!raw) return "";
    try {
      return decodeURIComponent(raw);
    } catch {
      return null;
    }
  }
  return null;
};

const clearCookie = (key: string) => {
  document.cookie = `${key}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=lax`;
};

const cleanupLegacyHomePersistence = () => {
  if (typeof window === "undefined") return;
  try {
    if (
      window.sessionStorage.getItem(LEGACY_HOME_CLEANUP_SESSION_KEY) === "1"
    ) {
      return;
    }
  } catch {
    // Ignore sessionStorage failures and still attempt cleanup once.
  }

  try {
    LEGACY_HOME_STORAGE_KEYS.forEach((key) => {
      window.localStorage.removeItem(key);
    });
    const keysToRemove: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key) continue;
      if (key.startsWith(HOME_STABLE_HEIGHT_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => {
      window.localStorage.removeItem(key);
    });
  } catch {
    // Ignore localStorage cleanup failures; startup must continue.
  }

  HOME_CRITICAL_COOKIE_KEYS.forEach((key) => {
    try {
      const raw = readCookieValue(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { path?: string } | null;
      if (parsed?.path === "/") {
        clearCookie(key);
      }
    } catch {
      clearCookie(key);
    }
  });

  try {
    window.sessionStorage.setItem(LEGACY_HOME_CLEANUP_SESSION_KEY, "1");
  } catch {
    // Ignore sessionStorage failures.
  }
};

const updateFragmentStatus = (
  lang: Lang,
  state: "idle" | "streaming" | "error",
) => {
  if (typeof document === "undefined") return;
  const element = document.querySelector<HTMLElement>(
    "[data-static-fragment-status]",
  );
  if (!element) return;
  const copy = getStaticHomeUiCopy(lang);
  const label =
    state === "streaming"
      ? copy.fragmentStatusStreaming
      : state === "error"
        ? copy.fragmentStatusStalled
        : copy.fragmentStatusIdle;
  element.dataset.state = state;
  element.setAttribute("aria-label", label);
};

const syncHomeDockIfNeeded = async (
  controller: Pick<HomeControllerState, "isAuthenticated" | "lang" | "path">,
) => {
  const dockState = {
    currentPath: controller.path,
    isAuthenticated: controller.isAuthenticated,
    lang: controller.lang,
  };

  if (!staticDockRootNeedsSync(dockState)) {
    syncStaticDockRootState(dockState);
    return;
  }

  const dockRoot = syncStaticDockRootState(dockState);
  if (!dockRoot) return;

  const { syncStaticDockMarkup } = await import("./home-dock-dom");
  syncStaticDockMarkup({
    root: dockRoot,
    lang: controller.lang,
    currentPath: controller.path,
    isAuthenticated: controller.isAuthenticated,
    force: true,
    lockMetrics: true,
  });
};

const refreshHomeDockAuthIfNeeded = async (controller: HomeControllerState) => {
  const session = await loadClientAuthSession();
  if (controller.destroyed) return;
  const isAuthenticated = session.status === "authenticated";
  if (controller.isAuthenticated === isAuthenticated) return;
  controller.isAuthenticated = isAuthenticated;
  writeStaticShellSeed({ isAuthenticated });
  await syncHomeDockIfNeeded(controller);
};

const resolveStaticHomePaintRoot = (
  target?: ParentNode | Element | null,
): HTMLElement | null => {
  const candidate =
    target ?? (typeof document !== "undefined" ? document : null);
  if (!candidate) return null;

  if (
    typeof (candidate as Element).getAttribute === "function" &&
    (candidate as Element).getAttribute("data-static-home-root") !== null
  ) {
    return candidate as HTMLElement;
  }

  if (typeof (candidate as ParentNode).querySelector === "function") {
    return (candidate as ParentNode).querySelector<HTMLElement>(
      "[data-static-home-root]",
    );
  }

  return null;
};

type RequestHomeDemoObserveOptions = {
  root?: ParentNode | null;
  doc?: Document | null;
};

export const requestHomeDemoObserve = ({
  root = typeof document !== "undefined" ? document : null,
  doc = typeof document !== "undefined" ? document : null,
}: RequestHomeDemoObserveOptions = {}) =>
  dispatchHomeDemoObserveEvent({
    root,
    doc,
  });

export const scheduleStaticHomePaintReady = ({
  root,
  requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
  cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
  setTimer = globalThis.setTimeout?.bind(globalThis),
  clearTimer = globalThis.clearTimeout?.bind(globalThis),
  onReady,
}: ScheduleStaticHomePaintReadyOptions = {}) => {
  const staticHomeRoot = resolveStaticHomePaintRoot(root);
  if (!staticHomeRoot) return () => undefined;
  if (staticHomeRoot.getAttribute(STATIC_HOME_PAINT_ATTR) === "ready") {
    onReady?.();
    return () => undefined;
  }

  if (typeof requestFrame !== "function") {
    staticHomeRoot.setAttribute(STATIC_HOME_PAINT_ATTR, "ready");
    onReady?.();
    return () => undefined;
  }

  let firstFrame = 0;
  let secondFrame = 0;
  let fallbackTimer: ReturnType<typeof setTimeout> | 0 = 0;
  let cancelled = false;

  const markReady = () => {
    if (cancelled) return;
    const liveRoot =
      resolveStaticHomePaintRoot(staticHomeRoot) ??
      resolveStaticHomePaintRoot();
    if (!liveRoot) return;
    liveRoot.setAttribute(STATIC_HOME_PAINT_ATTR, "ready");
    onReady?.();
  };

  firstFrame = requestFrame(() => {
    if (cancelled) return;
    secondFrame = requestFrame(markReady);
  });
  if (typeof setTimer === "function") {
    fallbackTimer = setTimer(markReady, 180);
  }

  return () => {
    cancelled = true;
    if (typeof cancelFrame === "function") {
      if (firstFrame) cancelFrame(firstFrame);
      if (secondFrame) cancelFrame(secondFrame);
    }
    if (fallbackTimer && typeof clearTimer === "function") {
      clearTimer(fallbackTimer);
    }
  };
};

type ScheduleStaticHomePaintReadyOptions = {
  root?: ParentNode | Element | null;
  requestFrame?: typeof requestAnimationFrame;
  cancelFrame?: typeof cancelAnimationFrame;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
  onReady?: () => void;
};

type HomeFragmentHydrationController = Pick<
  HomeControllerState,
  | "destroyed"
  | "lang"
  | "patchQueue"
  | "fetchAbort"
  | "homeDemoStylesheetHref"
  | "homeFragmentBootstrapHref"
>;

type HomeFragmentHydrationManager = {
  observeWithin: (root: ParentNode) => void;
  scheduleAnchorHydration: () => void;
  schedulePreviewRefreshes: () => void;
  retryPending: () => void;
  destroy: () => void;
};

type StaticHomeReadyStaggerManager = {
  observeWithin: (root: ParentNode) => void;
  releaseVisible: () => void;
  destroy: () => void;
};

type BindHomeFragmentHydrationOptions = {
  controller: HomeFragmentHydrationController;
  root?: ParentNode;
  fetchBatch?: typeof fetchHomeFragmentBatch;
  ensureDemoStylesheet?: typeof ensureHomeDemoStylesheet;
  scheduleTask?: typeof scheduleStaticShellTask;
  ObserverImpl?: typeof IntersectionObserver;
};

type BindStaticHomeReadyStaggerOptions = {
  root?: ParentNode;
  queueReady?: typeof queueReadyStagger;
  ObserverImpl?: typeof IntersectionObserver;
};

type HydratableHomeFragmentCard = {
  card: HTMLElement;
  id: string;
  stage: StaticHomeCardStage;
};

const HOME_DEFERRED_HYDRATION_ROOT_MARGIN = "0px";
const HOME_DEFERRED_HYDRATION_THRESHOLD = 0;
const HOME_READY_STAGGER_ROOT_MARGIN = "0px";
const HOME_READY_STAGGER_THRESHOLD = 0.01;
const HOME_DEFERRED_REVALIDATION_IDLE_TIMEOUT_MS = 5000;
const HOME_DEFERRED_REVALIDATION_INTENT_EVENTS = [
  "pointerdown",
  "keydown",
  "touchstart",
] as const;

type HomeDeferredRevalidationWindow = Pick<
  Window,
  "addEventListener" | "removeEventListener" | "setTimeout" | "clearTimeout"
> & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: { timeout?: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

type HomeDeferredRevalidationDocument = Pick<
  Document,
  "visibilityState" | "addEventListener" | "removeEventListener"
>;

type HomeDeferredRevalidationHandle = {
  cleanup: () => void;
  trigger: () => boolean;
};

type ScheduleHomeDeferredRevalidationOptions = {
  controller: HomeControllerState;
  homeFragmentHydration: Pick<
    HomeFragmentHydrationManager,
    "schedulePreviewRefreshes"
  >;
  refreshAuth?: (controller: HomeControllerState) => Promise<void>;
  win?: HomeDeferredRevalidationWindow | null;
  doc?: HomeDeferredRevalidationDocument | null;
};

type ScheduleHomeDeferredActionOptions = {
  controller: HomeControllerState;
  idleTimeoutMs: number;
  run: () => void;
  win?: HomeDeferredRevalidationWindow | null;
  doc?: HomeDeferredRevalidationDocument | null;
};

const isStaticHomeCardStage = (
  value: string | null,
): value is StaticHomeCardStage =>
  value === "critical" || value === "anchor" || value === "deferred";

const isRefreshableHomeFragmentKind = (value: string | null) =>
  value === "planner" ||
  value === "ledger" ||
  value === "island" ||
  value === "react";

const collectPendingHomeFragmentCards = (
  root: ParentNode = document,
): HydratableHomeFragmentCard[] =>
  Array.from(
    root.querySelectorAll<HTMLElement>("[data-static-fragment-card]"),
  ).flatMap((card) => {
    const id = card.dataset.fragmentId;
    const patchState = card.getAttribute(STATIC_HOME_PATCH_STATE_ATTR);
    const stage = card.getAttribute(STATIC_HOME_STAGE_ATTR);
    if (!id || patchState !== "pending" || !isStaticHomeCardStage(stage)) {
      return [];
    }
    return [{ card, id, stage }];
  });

const collectRefreshableHomeFragmentCards = (
  root: ParentNode = document,
): HydratableHomeFragmentCard[] =>
  Array.from(
    root.querySelectorAll<HTMLElement>("[data-static-fragment-card]"),
  ).flatMap((card) => {
    const id = card.dataset.fragmentId;
    const patchState = card.getAttribute(STATIC_HOME_PATCH_STATE_ATTR);
    const stage = card.getAttribute(STATIC_HOME_STAGE_ATTR);
    const fragmentKind = card.getAttribute(STATIC_HOME_FRAGMENT_KIND_ATTR);
    if (
      !id ||
      patchState !== "ready" ||
      !isStaticHomeCardStage(stage) ||
      stage === "critical" ||
      !isRefreshableHomeFragmentKind(fragmentKind)
    ) {
      return [];
    }
    return [{ card, id, stage }];
  });

const isQueuedStaticHomeReadyStaggerCard = (
  card: Element | null,
): card is HTMLElement =>
  Boolean(
    card &&
      typeof (card as HTMLElement).getAttribute === "function" &&
      (card as HTMLElement).getAttribute(READY_STAGGER_STATE_ATTR) ===
        "queued" &&
      (card as HTMLElement).getAttribute(STATIC_HOME_STAGE_ATTR) !==
        "critical",
  );

export const bindStaticHomeReadyStagger = ({
  root = document,
  queueReady = queueReadyStagger,
  ObserverImpl = (
    globalThis as typeof globalThis & {
      IntersectionObserver?: typeof IntersectionObserver;
    }
  ).IntersectionObserver,
}: BindStaticHomeReadyStaggerOptions = {}): StaticHomeReadyStaggerManager => {
  const observedCards = new Set<Element>();
  const releasedIds = new Set<string>();
  let armed = false;

  const releaseCard = (card: HTMLElement) => {
    const fragmentId = card.dataset.fragmentId;
    if (!fragmentId || releasedIds.has(fragmentId)) return;
    releasedIds.add(fragmentId);
    queueReady(card, { group: "static-home-ready", replay: true });
    observer?.unobserve(card);
    observedCards.delete(card);
  };

  const observer =
    typeof ObserverImpl === "function"
      ? new ObserverImpl(
          (entries) => {
            if (!armed) return;
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return;
              const card = entry.target as HTMLElement;
              if (!isQueuedStaticHomeReadyStaggerCard(card)) return;
              releaseCard(card);
            });
          },
          {
            root: null,
            rootMargin: HOME_READY_STAGGER_ROOT_MARGIN,
            threshold: HOME_READY_STAGGER_THRESHOLD,
          },
        )
      : null;

  const observeWithin = (nextRoot: ParentNode) => {
    Array.from(
      nextRoot.querySelectorAll<HTMLElement>(
        `[data-static-fragment-card][${READY_STAGGER_STATE_ATTR}="queued"]`,
      ),
    ).forEach((card) => {
      if (!isQueuedStaticHomeReadyStaggerCard(card)) return;
      if (releasedIds.has(card.dataset.fragmentId ?? "")) return;
      if (!observer) {
        if (armed) {
          releaseCard(card);
        }
        return;
      }
      if (observedCards.has(card)) return;
      observedCards.add(card);
      observer.observe(card);
    });
  };

  return {
    observeWithin,
    releaseVisible() {
      armed = true;
      observeWithin(root);
    },
    destroy() {
      observer?.disconnect();
      observedCards.clear();
      releasedIds.clear();
    },
  };
};

export const bindHomeFragmentHydration = ({
  controller,
  root = document,
  fetchBatch = fetchHomeFragmentBatch,
  ensureDemoStylesheet = ensureHomeDemoStylesheet,
  scheduleTask = scheduleStaticShellTask,
  ObserverImpl = (
    globalThis as typeof globalThis & {
      IntersectionObserver?: typeof IntersectionObserver;
    }
  ).IntersectionObserver,
}: BindHomeFragmentHydrationOptions): HomeFragmentHydrationManager => {
  const observedDeferredCards = new Set<Element>();
  const visibleDeferredIds = new Set<string>();
  const queuedAnchorIds = new Set<string>();
  const queuedDeferredIds = new Set<string>();
  let previewRefreshesEnabled = false;

  const isRefreshableHomeFragmentCard = (card: HTMLElement) =>
    card.getAttribute(STATIC_HOME_PATCH_STATE_ATTR) === "ready" &&
    card.getAttribute(STATIC_HOME_STAGE_ATTR) !== "critical" &&
    isRefreshableHomeFragmentKind(
      card.getAttribute(STATIC_HOME_FRAGMENT_KIND_ATTR),
    );

  const observer =
    typeof ObserverImpl === "function"
      ? new ObserverImpl(
          (entries) => {
            if (controller.destroyed) return;

            entries.forEach((entry) => {
              const card = entry.target as HTMLElement;
              const id = card.dataset.fragmentId;
              if (!id) return;

              if (
                card.getAttribute(STATIC_HOME_PATCH_STATE_ATTR) !== "pending" &&
                !isRefreshableHomeFragmentCard(card)
              ) {
                observer?.unobserve(card);
                observedDeferredCards.delete(card);
                visibleDeferredIds.delete(id);
                queuedDeferredIds.delete(id);
                controller.patchQueue?.setVisible(id, false);
                return;
              }

              const visible =
                entry.isIntersecting &&
                (typeof entry.intersectionRatio !== "number" ||
                  entry.intersectionRatio >= HOME_DEFERRED_HYDRATION_THRESHOLD);
              controller.patchQueue?.setVisible(id, visible);
              if (!visible) {
                visibleDeferredIds.delete(id);
                queuedDeferredIds.delete(id);
                return;
              }

              visibleDeferredIds.add(id);
              queuedDeferredIds.add(id);
              scheduleNextHydration();
            });
          },
          {
            root: null,
            rootMargin: HOME_DEFERRED_HYDRATION_ROOT_MARGIN,
            threshold: HOME_DEFERRED_HYDRATION_THRESHOLD,
          },
        )
      : null;
  let cancelScheduledHydration: (() => void) | null = null;
  let hydrationInFlight = false;

  const collectQueuedIds = (
    stage: Extract<StaticHomeCardStage, "anchor" | "deferred">,
  ) => {
    const activeQueue =
      stage === "anchor" ? queuedAnchorIds : queuedDeferredIds;
    return Array.from(
      root.querySelectorAll<HTMLElement>("[data-static-fragment-card]"),
    )
      .flatMap((card) => {
        const id = card.dataset.fragmentId;
        const cardStage = card.getAttribute(STATIC_HOME_STAGE_ATTR);
        if (!id || !isStaticHomeCardStage(cardStage)) {
          return [];
        }
        return [{ card, id, stage: cardStage }];
      })
      .filter(({ card, id, stage: cardStage }) => {
        if (cardStage !== stage || !activeQueue.has(id)) return false;
        if (
          card.getAttribute(STATIC_HOME_PATCH_STATE_ATTR) !== "pending" &&
          (!previewRefreshesEnabled || !isRefreshableHomeFragmentCard(card))
        ) {
          return false;
        }
        return stage === "anchor" || visibleDeferredIds.has(id);
      })
      .map(({ id }) => id);
  };

  const hasQueuedHydration = () =>
    collectQueuedIds("anchor").length > 0 ||
    collectQueuedIds("deferred").length > 0;

  const runHydrationBatch = async () => {
    if (controller.destroyed) return;
    const anchorIds = collectQueuedIds("anchor");
    const ids = anchorIds.length > 0 ? anchorIds : collectQueuedIds("deferred");
    if (!ids.length) return;

    ids.forEach((id) => {
      if (anchorIds.length > 0) {
        queuedAnchorIds.delete(id);
        return;
      }
      queuedDeferredIds.delete(id);
    });

    if (controller.fetchAbort) {
      controller.fetchAbort.abort();
    }

    const fetchAbort = new AbortController();
    controller.fetchAbort = fetchAbort;
    updateFragmentStatus(controller.lang, "streaming");

    try {
      const demoStylesheetReady = ensureDemoStylesheet({
        href: controller.homeDemoStylesheetHref ?? undefined,
      });
      const batchOptions = {
        lang: controller.lang,
        signal: fetchAbort.signal,
        knownVersions: collectStaticHomeKnownVersions(root),
        bootstrapHref: controller.homeFragmentBootstrapHref ?? undefined,
      };
      const payloads =
        fetchBatch === fetchHomeFragmentBatch &&
        isHomeFragmentBootstrapSubset(ids)
          ? await fetchHomeFragmentBootstrapSelection(ids, batchOptions)
          : await fetchBatch(ids, batchOptions);

      if (
        controller.destroyed ||
        controller.fetchAbort !== fetchAbort ||
        fetchAbort.signal.aborted
      )
        return;

      await demoStylesheetReady;
      if (
        controller.destroyed ||
        controller.fetchAbort !== fetchAbort ||
        fetchAbort.signal.aborted
      )
        return;

      ids.forEach((id) => {
        const payload = payloads[id];
        if (!payload) return;
        controller.patchQueue?.enqueue(payload);
      });

      updateFragmentStatus(controller.lang, "idle");
      controller.fetchAbort = null;
    } catch (error) {
      if (
        controller.destroyed ||
        controller.fetchAbort !== fetchAbort ||
        fetchAbort.signal.aborted
      )
        return;
      console.error("Static home fragment hydration failed:", error);
      updateFragmentStatus(controller.lang, "error");
      controller.fetchAbort = null;
    }
  };

  const scheduleNextHydration = () => {
    const staticHomeRoot = resolveStaticHomePaintRoot(root);
    if (
      controller.destroyed ||
      hydrationInFlight ||
      cancelScheduledHydration ||
      !hasQueuedHydration() ||
      staticHomeRoot?.getAttribute(STATIC_HOME_PAINT_ATTR) !== "ready"
    ) {
      return;
    }

    cancelScheduledHydration = scheduleTask(
      () => {
        cancelScheduledHydration = null;
        if (controller.destroyed) return;

        hydrationInFlight = true;
        void runHydrationBatch().finally(() => {
          hydrationInFlight = false;
          if (controller.destroyed) return;
          scheduleNextHydration();
        });
      },
      {
        priority: "background",
        timeoutMs: 250,
        waitForPaint: true,
      },
    );
  };

  const manager: HomeFragmentHydrationManager = {
    observeWithin(nextRoot) {
      if (controller.destroyed) return;

      Array.from(
        nextRoot.querySelectorAll<HTMLElement>("[data-static-fragment-card]"),
      )
        .flatMap((card) => {
          const id = card.dataset.fragmentId;
          const stage = card.getAttribute(STATIC_HOME_STAGE_ATTR);
          if (!id || !isStaticHomeCardStage(stage) || stage !== "deferred") {
            return [];
          }
          if (
            card.getAttribute(STATIC_HOME_PATCH_STATE_ATTR) !== "pending" &&
            !isRefreshableHomeFragmentCard(card)
          ) {
            return [];
          }
          return [{ card, id, stage }];
        })
        .forEach(({ card, id }) => {
          if (!observer) {
            visibleDeferredIds.add(id);
            if (
              card.getAttribute(STATIC_HOME_PATCH_STATE_ATTR) === "pending" ||
              (previewRefreshesEnabled && isRefreshableHomeFragmentCard(card))
            ) {
              queuedDeferredIds.add(id);
            }
            controller.patchQueue?.setVisible(id, true);
            scheduleNextHydration();
            return;
          }

          if (observedDeferredCards.has(card)) return;
          observedDeferredCards.add(card);
          observer.observe(card);
        });
    },
    scheduleAnchorHydration() {
      if (controller.destroyed) return;
      collectPendingHomeFragmentCards(root)
        .filter(({ stage }) => stage === "anchor")
        .forEach(({ id }) => {
          queuedAnchorIds.add(id);
        });
      scheduleNextHydration();
    },
    schedulePreviewRefreshes() {
      if (controller.destroyed) return;
      previewRefreshesEnabled = true;
      collectRefreshableHomeFragmentCards(root)
        .filter(({ stage }) => stage === "anchor")
        .forEach(({ id }) => {
          queuedAnchorIds.add(id);
        });
      manager.observeWithin(root);
      scheduleNextHydration();
    },
    retryPending() {
      if (controller.destroyed) return;
      manager.observeWithin(root);
      manager.scheduleAnchorHydration();
      scheduleNextHydration();
    },
    destroy() {
      cancelScheduledHydration?.();
      cancelScheduledHydration = null;
      controller.fetchAbort?.abort();
      controller.fetchAbort = null;
      observer?.disconnect();
      observedDeferredCards.clear();
      visibleDeferredIds.clear();
      queuedAnchorIds.clear();
      queuedDeferredIds.clear();
    },
  };
  return manager;
};

const scheduleHomeDeferredAction = ({
  controller,
  idleTimeoutMs,
  run,
  win = typeof window !== "undefined" ? window : null,
  doc = typeof document !== "undefined" ? document : null,
}: ScheduleHomeDeferredActionOptions): HomeDeferredRevalidationHandle => {
  if (!win || !doc) {
    return {
      cleanup: () => undefined,
      trigger: () => false,
    };
  }

  const liveWin = win;
  const liveDoc = doc;

  let cancelled = false;
  let started = false;
  let idleId: number | null = null;
  let timeoutId: number | null = null;
  const eventOptions: AddEventListenerOptions = {
    capture: true,
    passive: true,
  };

  const cleanupTriggers = () => {
    HOME_DEFERRED_REVALIDATION_INTENT_EVENTS.forEach((eventName) => {
      liveWin.removeEventListener(
        eventName,
        runDeferredRevalidation,
        eventOptions,
      );
    });
    liveDoc.removeEventListener("visibilitychange", handleVisibilityChange);

    if (idleId !== null && typeof liveWin.cancelIdleCallback === "function") {
      liveWin.cancelIdleCallback(idleId);
      idleId = null;
    }
    if (timeoutId !== null) {
      liveWin.clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  function runDeferredRevalidation() {
    if (
      cancelled ||
      started ||
      controller.destroyed ||
      liveDoc.visibilityState === "hidden"
    ) {
      return false;
    }

    started = true;
    cleanupTriggers();
    run();
    return true;
  }

  function handleVisibilityChange() {
    if (liveDoc.visibilityState !== "visible") return;
    runDeferredRevalidation();
  }

  HOME_DEFERRED_REVALIDATION_INTENT_EVENTS.forEach((eventName) => {
    liveWin.addEventListener(eventName, runDeferredRevalidation, eventOptions);
  });
  liveDoc.addEventListener("visibilitychange", handleVisibilityChange);

  const triggerIdleRevalidation = () => {
    idleId = null;
    timeoutId = null;
    runDeferredRevalidation();
  };

  if (typeof liveWin.requestIdleCallback === "function") {
    idleId = liveWin.requestIdleCallback(triggerIdleRevalidation, {
      timeout: idleTimeoutMs,
    });
  } else {
    timeoutId = liveWin.setTimeout(
      triggerIdleRevalidation,
      idleTimeoutMs,
    ) as unknown as number;
  }

  return {
    cleanup: () => {
      cancelled = true;
      cleanupTriggers();
    },
    trigger: () => runDeferredRevalidation(),
  };
};

const scheduleHomeDeferredRevalidation = ({
  controller,
  homeFragmentHydration,
  refreshAuth = refreshHomeDockAuthIfNeeded,
  win = typeof window !== "undefined" ? window : null,
  doc = typeof document !== "undefined" ? document : null,
}: ScheduleHomeDeferredRevalidationOptions): HomeDeferredRevalidationHandle =>
  scheduleHomeDeferredAction({
    controller,
    idleTimeoutMs: HOME_DEFERRED_REVALIDATION_IDLE_TIMEOUT_MS,
    win,
    doc,
    run: () => {
      homeFragmentHydration.schedulePreviewRefreshes();
      void refreshAuth(controller).catch((error) => {
        console.error("Static home auth dock refresh failed:", error);
      });
    },
  });

type ScheduleHomePostLcpTasksOptions = {
  controller: HomeControllerState;
  lcpGate?: HomeFirstLcpGate;
  homeFragmentHydration: Pick<
    HomeFragmentHydrationManager,
    "schedulePreviewRefreshes" | "retryPending"
  >;
  refreshAuth?: (controller: HomeControllerState) => Promise<void>;
  win?: HomeDeferredRevalidationWindow | null;
  doc?: HomeDeferredRevalidationDocument | null;
};

export const scheduleHomePostLcpTasks = ({
  controller,
  lcpGate = createHomeFirstLcpGate(),
  homeFragmentHydration,
  refreshAuth = refreshHomeDockAuthIfNeeded,
  win = typeof window !== "undefined" ? window : null,
  doc = typeof document !== "undefined" ? document : null,
}: ScheduleHomePostLcpTasksOptions) => {
  let cancelled = false;
  let deferredRevalidation: HomeDeferredRevalidationHandle | null = null;
  let postLcpStarted = false;

  const handlePageShow = (event: PageTransitionEvent) => {
    if (!event.persisted || controller.destroyed) return;
    updateFragmentStatus(controller.lang, "idle");
    homeFragmentHydration.retryPending();
    if (deferredRevalidation?.trigger()) return;
    void refreshAuth(controller).catch((error) => {
      console.error("Static home auth dock refresh failed:", error);
    });
  };

  win?.addEventListener("pageshow", handlePageShow);

  const startPostLcpTasks = () => {
    if (cancelled || controller.destroyed || postLcpStarted) return;
    postLcpStarted = true;
    deferredRevalidation = scheduleHomeDeferredRevalidation({
      controller,
      homeFragmentHydration,
      refreshAuth,
      win,
      doc,
    });
  };

  void lcpGate.wait.then(() => {
    startPostLcpTasks();
  });

  return () => {
    cancelled = true;
    lcpGate.cleanup();
    win?.removeEventListener("pageshow", handlePageShow);
    deferredRevalidation?.cleanup();
    deferredRevalidation = null;
  };
};

const applyShellLanguageSeed = (
  lang: Lang,
  shellSeed: LanguageSeedPayload,
  routeSeed: LanguageSeedPayload,
) => {
  seedStaticHomeCopy(lang, shellSeed, routeSeed);
  setDocumentLang(lang);
};

const refreshThemeButton = (lang: Lang) => {
  const button = document.querySelector<HTMLButtonElement>(
    "[data-static-theme-toggle]",
  );
  if (!button) return;
  const theme =
    document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  const copy = getStaticHomeUiCopy(lang);
  button.dataset.theme = theme;
  button.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
  button.setAttribute(
    "aria-label",
    theme === "dark" ? copy.themeAriaToLight : copy.themeAriaToDark,
  );
  button.replaceChildren(createThemeIcon(theme));
};

const bindShellControls = (controller: HomeControllerState) => {
  const settingsRoot = document.querySelector<HTMLElement>(".topbar-settings");
  const settingsToggle = document.querySelector<HTMLButtonElement>(
    "[data-static-settings-toggle]",
  );
  const settingsPanel =
    document.querySelector<HTMLElement>(".settings-dropdown");
  const languageMenuToggle = document.querySelector<HTMLButtonElement>(
    "[data-static-language-menu-toggle]",
  );
  const languageDrawer = document.querySelector<HTMLElement>(
    ".settings-lang-drawer",
  );
  const themeToggle = document.querySelector<HTMLButtonElement>(
    "[data-static-theme-toggle]",
  );

  if (!settingsRoot || !settingsToggle || !settingsPanel || !themeToggle)
    return;

  const closeLanguageMenu = (restoreFocus = false) => {
    const wasOpen = languageDrawer?.dataset.open === "true";
    if (restoreFocus && wasOpen && languageMenuToggle) {
      restoreOverlayFocusBeforeHide(languageDrawer, languageMenuToggle);
    }
    setOverlaySurfaceState(languageDrawer, false);
    if (languageMenuToggle) {
      languageMenuToggle.setAttribute("aria-expanded", "false");
    }
  };

  const closeMenus = (restoreFocus = false) => {
    const wasOpen = settingsRoot.dataset.open === "true";
    settingsRoot.dataset.open = "false";
    settingsToggle.setAttribute("aria-expanded", "false");
    closeLanguageMenu(false);
    if (restoreFocus && wasOpen) {
      restoreOverlayFocusBeforeHide(settingsPanel, settingsToggle);
    }
    setOverlaySurfaceState(settingsPanel, false);
  };

  const toggleSettings = () => {
    const next = settingsRoot.dataset.open !== "true";
    settingsRoot.dataset.open = next ? "true" : "false";
    settingsToggle.setAttribute("aria-expanded", next ? "true" : "false");
    if (!next) {
      closeMenus(false);
      return;
    }
    setOverlaySurfaceState(settingsPanel, true);
    focusOverlayEntry(settingsPanel, languageMenuToggle ?? themeToggle);
  };

  const toggleLanguageMenu = () => {
    if (!languageDrawer || !languageMenuToggle) return;
    const next = languageDrawer.dataset.open !== "true";
    setOverlaySurfaceState(languageDrawer, next);
    languageMenuToggle.setAttribute("aria-expanded", next ? "true" : "false");
    if (next) {
      focusOverlayEntry(languageDrawer, [
        'input[name="static-topbar-language"]:checked',
        'input[name="static-topbar-language"]',
      ]);
      return;
    }
    restoreOverlayFocusBeforeHide(languageDrawer, languageMenuToggle);
    setOverlaySurfaceState(languageDrawer, false);
  };

  const handleTheme = () => {
    const nextTheme: Theme =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    persistStaticTheme(nextTheme);
    refreshThemeButton(controller.lang);
  };
  const handleThemeClick = () => {
    handleTheme();
  };

  settingsToggle.addEventListener("click", toggleSettings);
  themeToggle.addEventListener("click", handleThemeClick);
  controller.cleanupFns.push(() =>
    settingsToggle.removeEventListener("click", toggleSettings),
  );
  controller.cleanupFns.push(() =>
    themeToggle.removeEventListener("click", handleThemeClick),
  );
  controller.cleanupFns.push(
    bindOverlayDismiss({
      root: settingsRoot,
      onDismiss: () => {
        if (
          settingsRoot.dataset.open !== "true" &&
          languageDrawer?.dataset.open !== "true"
        ) {
          return;
        }
        closeMenus(true);
      },
    }),
  );

  if (languageMenuToggle && languageDrawer) {
    languageMenuToggle.addEventListener("click", toggleLanguageMenu);
    controller.cleanupFns.push(() =>
      languageMenuToggle.removeEventListener("click", toggleLanguageMenu),
    );
  }

  document
    .querySelectorAll<HTMLInputElement>("[data-static-language-option]")
    .forEach((input) => {
      const handleChange = () => {
        const nextLang = input.dataset.lang as Lang | undefined;
        input.blur();
        const finalizeLanguageChange = () => {
          closeMenus(true);
          if (!nextLang || nextLang === controller.lang) {
            return;
          }
          void swapStaticHomeLanguage(nextLang);
        };
        if (typeof queueMicrotask === "function") {
          queueMicrotask(finalizeLanguageChange);
          return;
        }
        finalizeLanguageChange();
      };

      input.addEventListener("change", handleChange);
      controller.cleanupFns.push(() =>
        input.removeEventListener("change", handleChange),
      );
    });

  setOverlaySurfaceState(settingsPanel, false);
  closeLanguageMenu(false);
  refreshThemeButton(controller.lang);
};

const stopHomeHydrationFetches = (controller: HomeControllerState) => {
  if (controller.fetchAbort) {
    controller.fetchAbort.abort();
    controller.fetchAbort = null;
  }
};

const destroyController = async (controller: HomeControllerState | null) => {
  if (!controller) return;
  controller.destroyed = true;
  stopHomeHydrationFetches(controller);
  controller.cleanupFns.splice(0).forEach((cleanup) => cleanup());
  controller.patchQueue = null;
};

const swapStaticHomeLanguage = async (nextLang: Lang) => {
  if (languageSwapInFlight) return;
  const current = readStaticHomeBootstrapData();
  if (!current || current.lang === nextLang) return;
  languageSwapInFlight = true;

  try {
    const snapshot = await loadStaticShellSnapshot(
      current.snapshotKey,
      nextLang,
    );
    const languageSeed = await loadStaticShellLanguageSeed(
      current.currentPath,
      nextLang,
    );

    await destroyController(activeController);
    activeController = null;

    applyStaticShellSnapshot(snapshot, {
      dockState: {
        lang: nextLang,
        currentPath: current.currentPath,
        isAuthenticated: current.isAuthenticated,
      },
    });
    writeStaticShellSeed({
      lang: nextLang,
      currentPath: current.currentPath,
      snapshotKey: current.snapshotKey,
      languageSeed,
      isAuthenticated: current.isAuthenticated,
    });
    persistStaticLang(nextLang);
    updateStaticShellUrlLang(nextLang);

    await bootstrapStaticHome();
  } catch (error) {
    console.error("Failed to switch static home language:", error);
  } finally {
    languageSwapInFlight = false;
  }
};

export const bootstrapStaticHome = async () => {
  const data = readStaticHomeBootstrapData();
  if (!data) return;
  primeTrustedTypesPolicies();
  const preferredLang = resolvePreferredStaticShellLang(data.lang);
  if (preferredLang !== data.lang) {
    try {
      const snapshot = await loadStaticShellSnapshot(
        data.snapshotKey,
        preferredLang,
      );
      const languageSeed = await loadStaticShellLanguageSeed(
        data.currentPath,
        preferredLang,
      );
      applyStaticShellSnapshot(snapshot, {
        dockState: {
          lang: preferredLang,
          currentPath: data.currentPath,
          isAuthenticated: data.isAuthenticated,
        },
      });
      writeStaticShellSeed({
        lang: preferredLang,
        currentPath: data.currentPath,
        snapshotKey: data.snapshotKey,
        languageSeed,
        isAuthenticated: data.isAuthenticated,
      });
      persistStaticLang(preferredLang);
      updateStaticShellUrlLang(preferredLang);
      await bootstrapStaticHome();
      return;
    } catch (error) {
      console.error(
        "Failed to restore preferred home language snapshot:",
        error,
      );
    }
  }

  cleanupLegacyHomePersistence();
  applyShellLanguageSeed(data.lang, data.shellSeed, data.routeSeed);
  await destroyController(activeController);

  const controller: HomeControllerState = {
    isAuthenticated: data.isAuthenticated,
    lang: data.lang,
    path: data.currentPath,
    fragmentOrder: data.fragmentOrder,
    planSignature: data.planSignature ?? "",
    versionSignature: data.versionSignature ?? "",
    homeDemoStylesheetHref: data.homeDemoStylesheetHref,
    homeFragmentBootstrapHref: data.fragmentBootstrapHref,
    fetchAbort: null,
    cleanupFns: [],
    patchQueue: null,
    destroyed: false,
  };
  activeController = controller;

  const homeFragmentHydration = bindHomeFragmentHydration({ controller });
  controller.cleanupFns.push(() => homeFragmentHydration.destroy());
  controller.patchQueue = createStaticHomePatchQueue({
    lang: controller.lang,
    routeContext: {
      path: controller.path,
      lang: controller.lang,
      fragmentOrder: data.fragmentOrder,
      planSignature: data.planSignature ?? "",
      versionSignature: data.versionSignature ?? "",
    },
    onPatchedBody: (body) => {
      requestHomeDemoObserve({ root: body });
    },
  });
  controller.cleanupFns.push(() => controller.patchQueue?.destroy());
  controller.cleanupFns.push(
    scheduleStaticHomePaintReady({
      onReady: () => {
        if (controller.destroyed || document.visibilityState === "hidden")
          return;
        homeFragmentHydration.scheduleAnchorHydration();
      },
    }),
  );
  controller.cleanupFns.push(
    scheduleStaticShellTask(
      () => {
        if (controller.destroyed) return;
        homeFragmentHydration.observeWithin(document);
        requestHomeDemoObserve();
        void syncHomeDockIfNeeded(controller).catch((error) => {
          console.error("Static home dock sync failed:", error);
        });
      },
      {
        priority: "background",
        timeoutMs: 600,
        waitForPaint: true,
      },
    ),
  );
  controller.cleanupFns.push(
    scheduleStaticShellTask(
      () => {
        if (controller.destroyed) return;
        void persistInitialFragmentCardHeights({
          routeContext: {
            path: controller.path,
            lang: controller.lang,
            fragmentOrder: data.fragmentOrder,
            planSignature: data.planSignature ?? "",
            versionSignature: data.versionSignature ?? "",
          },
        }).catch((error) => {
          console.error(
            "Static home fragment height persistence failed:",
            error,
          );
        });
      },
      {
        priority: "background",
        timeoutMs: 1200,
        waitForPaint: true,
      },
    ),
  );
  controller.cleanupFns.push(
    scheduleHomePostLcpTasks({
      controller,
      homeFragmentHydration,
    }),
  );
  bindShellControls(controller);
  updateFragmentStatus(controller.lang, "idle");

  const handlePageHide = () => {
    stopHomeHydrationFetches(controller);
  };

  window.addEventListener("pagehide", handlePageHide);
  controller.cleanupFns.push(() =>
    window.removeEventListener("pagehide", handlePageHide),
  );
};
