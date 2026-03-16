import type { Lang } from "../lang/types";
import type { LanguageSeedPayload } from "../lang/selection";
import { getStaticHomeUiCopy, seedStaticHomeCopy } from "./home-copy-store";
import { readStaticHomeBootstrapData } from "./home-bootstrap-data";
import { dispatchHomeDemoObserveEvent } from "./home-demo-observe-event";
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
import {
  STATIC_HOME_FRAGMENT_KIND_ATTR,
  STATIC_HOME_PAINT_ATTR,
  STATIC_HOME_PATCH_STATE_ATTR,
  STATIC_HOME_STAGE_ATTR,
} from "./constants";
import { scheduleStaticShellTask } from "./scheduler";
import { primeTrustedTypesPolicies } from "../security/client";
import type { StaticHomeCardStage } from "./constants";
import { resolveStaticShellLangParam } from "./lang-param";
import { loadHomeBootstrapPostLcpRuntime } from "./home-bootstrap-post-lcp-runtime-loader";
import { loadHomeLanguageRuntime } from "./home-language-runtime-loader";
import { markStaticShellUserTiming } from "./static-shell-performance";

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
const STATIC_LANG_STORAGE_KEY = "prometheus-lang";
const STATIC_LANG_COOKIE_KEY = "prometheus-lang";
const STATIC_LANG_PREFERENCE_KEY = "prometheus:pref:locale";
const STATIC_LANG_STORAGE_KEYS = [
  STATIC_LANG_STORAGE_KEY,
  STATIC_LANG_PREFERENCE_KEY,
] as const;

let activeController: HomeControllerState | null = null;

const setDocumentLang = (value: Lang) => {
  document.documentElement.lang = value;
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
  ensureDemoStylesheet?: (options?: { href?: string }) => Promise<unknown>;
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
const HOME_POST_LCP_RUNTIME_WARM_DELAY_MS = 15000;
const HOME_POST_LCP_RUNTIME_INTENT_EVENTS = [
  "pointerenter",
  "pointerdown",
  "touchstart",
  "keydown",
  "focusin",
] as const;

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
  ensureDemoStylesheet = async () => undefined,
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
  let didMarkFirstAnchorBatch = false;

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
    const isAnchorBatch = anchorIds.length > 0;

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

      if (isAnchorBatch && !didMarkFirstAnchorBatch) {
        didMarkFirstAnchorBatch = true;
        markStaticShellUserTiming("prom:home:first-anchor-batch-fetched");
      }

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
    const hasAnchorHydration = collectQueuedIds("anchor").length > 0;
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
      hasAnchorHydration
        ? {
            priority: "user-visible",
            timeoutMs: 0,
            preferIdle: false,
          }
        : {
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

const applyShellLanguageSeed = (
  lang: Lang,
  shellSeed: LanguageSeedPayload,
  routeSeed: LanguageSeedPayload,
) => {
  seedStaticHomeCopy(lang, shellSeed, routeSeed);
  setDocumentLang(lang);
};

const resolvePreferredStaticHomeLang = (fallback: Lang) => {
  if (typeof window === "undefined") {
    return fallback;
  }

  const url = new URL(window.location.href);
  const paramLang = resolveStaticShellLangParam(url.searchParams.get("lang"));
  if (paramLang) {
    return paramLang;
  }

  for (const key of STATIC_LANG_STORAGE_KEYS) {
    try {
      const stored = resolveStaticShellLangParam(
        window.localStorage.getItem(key),
      );
      if (stored) {
        return stored;
      }
    } catch {
      // Ignore storage access failures.
    }
  }

  return resolveStaticShellLangParam(readCookieValue(STATIC_LANG_COOKIE_KEY)) ??
    fallback;
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

const installDeferredHomePostLcpRuntime = ({
  controller,
  homeFragmentHydration,
}: {
  controller: HomeControllerState;
  homeFragmentHydration: Pick<
    HomeFragmentHydrationManager,
    "schedulePreviewRefreshes" | "retryPending"
  >;
}) => {
  const settingsRoot = document.querySelector<HTMLElement>(".topbar-settings");
  let runtimeCleanup: (() => void) | null = null;
  let runtimePromise: Promise<void> | null = null;
  const eventOptions: AddEventListenerOptions = { capture: true };

  const cleanupTriggers = () => {
    if (!settingsRoot) {
      return;
    }
    settingsRoot.removeEventListener(
      "pointerdown",
      handleDeferredPostLcpIntent,
      eventOptions,
    );
    settingsRoot.removeEventListener(
      "touchstart",
      handleDeferredPostLcpIntent,
      eventOptions,
    );
    settingsRoot.removeEventListener(
      "keydown",
      handleDeferredPostLcpIntent,
      eventOptions,
    );
    settingsRoot.removeEventListener(
      "focusin",
      handleDeferredPostLcpIntent,
      eventOptions,
    );
  };

  const startPostLcpRuntime = () => {
    if (controller.destroyed || runtimePromise) {
      return;
    }

    runtimePromise = loadHomeBootstrapPostLcpRuntime()
      .then(({ installHomeBootstrapPostLcpRuntime }) => {
        cleanupTriggers();
        if (controller.destroyed) {
          return;
        }
        runtimeCleanup = installHomeBootstrapPostLcpRuntime({
          controller,
          homeFragmentHydration,
          bootstrapStaticHome,
          destroyActiveController: async () => {
            await destroyController(activeController);
            activeController = null;
          },
        });
      })
      .catch((error) => {
        runtimePromise = null;
        console.error("Static home post-LCP runtime failed:", error);
      });
  };

  function handleDeferredPostLcpIntent() {
    startPostLcpRuntime();
  }

  if (settingsRoot) {
    HOME_POST_LCP_RUNTIME_INTENT_EVENTS.forEach((eventName) => {
      settingsRoot.addEventListener(
        eventName,
        handleDeferredPostLcpIntent,
        eventOptions,
      );
    });
  }

  const cancelWarmRuntime = scheduleStaticShellTask(startPostLcpRuntime, {
      priority: "background",
      delayMs: HOME_POST_LCP_RUNTIME_WARM_DELAY_MS,
      timeoutMs: 5000,
      waitForPaint: true,
    });

  return () => {
    cleanupTriggers();
    cancelWarmRuntime();
    runtimeCleanup?.();
    runtimeCleanup = null;
  };
};

export const bootstrapStaticHome = async () => {
  const data = readStaticHomeBootstrapData();
  if (!data) return;
  primeTrustedTypesPolicies();
  const preferredLang = resolvePreferredStaticHomeLang(data.lang);
  if (preferredLang !== data.lang) {
    try {
      const { restorePreferredStaticHomeLanguage } =
        await loadHomeLanguageRuntime();
      const restored = await restorePreferredStaticHomeLanguage({
        current: data,
        preferredLang,
        destroyActiveController: async () => {
          await destroyController(activeController);
          activeController = null;
        },
        bootstrapStaticHome,
      });
      if (restored) {
        return;
      }
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
      },
      {
        priority: "background",
        timeoutMs: 600,
        waitForPaint: true,
      },
    ),
  );
  controller.cleanupFns.push(
    installDeferredHomePostLcpRuntime({
      controller,
      homeFragmentHydration,
    }),
  );
  updateFragmentStatus(controller.lang, "idle");

  const handlePageHide = () => {
    stopHomeHydrationFetches(controller);
  };

  window.addEventListener("pagehide", handlePageHide);
  controller.cleanupFns.push(() =>
    window.removeEventListener("pagehide", handlePageHide),
  );
};
