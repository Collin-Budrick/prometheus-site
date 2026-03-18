import type { Lang } from "../lang/types";
import type { LanguageSeedPayload } from "../lang/selection";
import type { FragmentPayload } from "../fragment/types";
import { getStaticHomeUiCopy, seedStaticHomeCopy } from "./home-copy-store";
import {
  readStaticHomeBootstrapData,
  resolveStaticHomeRouteSeed,
} from "./home-bootstrap-data";
import { dispatchHomeDemoObserveEvent } from "./home-demo-observe-event";
import type {
  FragmentRuntimeCardSizing,
  FragmentRuntimePlanEntry,
  FragmentRuntimeSizingMap,
} from "../fragment/runtime/protocol";
import {
  fetchHomeFragmentBatch,
  fetchHomeFragmentBootstrapSelection,
} from "./home-fragment-client";
import {
  isHomeFragmentBootstrapSubset,
} from "./home-fragment-bootstrap";
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
  STATIC_FRAGMENT_CARD_ATTR,
  STATIC_FRAGMENT_VERSION_ATTR,
  STATIC_FRAGMENT_WIDTH_BUCKET_ATTR,
  STATIC_FRAGMENT_WIDTH_BUCKET_MOBILE_ATTR,
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
import { HOME_DEFERRED_COMMIT_RELEASE_EVENT } from "./home-deferred-commit-release-event";
import {
  getFragmentHeightViewport,
  parseFragmentHeightLayout,
  resolveFragmentHeightWidthBucket,
} from "@prometheus/ui/fragment-height";
import { scheduleStaticRoutePaintReady } from "./static-route-paint";
import { ensureHomeSharedRuntime } from "./home-shared-runtime";

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
  sharedRuntime: HomeSharedRuntimeConnection | null;
  homeFragmentHydration: HomeFragmentHydrationManager | null;
  deferredRuntimeCleanup: (() => void) | null;
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
const HOME_LAYOUT_MAX_WIDTH = 1152;
const HOME_LAYOUT_BASE_PADDING = 48;
const HOME_LAYOUT_SM_PADDING = 80;
const HOME_LAYOUT_SM_BREAKPOINT = 640;
const HOME_LAYOUT_TWO_COLUMN_BREAKPOINT = 1025;
const HOME_LAYOUT_GAP = 24;
type HomeSharedRuntimeRequestOptions = {
  isAnchorBatch: boolean;
};

type HomeSharedRuntimeConnection = {
  requestFragments: (
    ids: string[],
    options: HomeSharedRuntimeRequestOptions,
  ) => Promise<void>;
  suspendForPageHide: () => void;
  resumeAfterPageShow: () => boolean;
};

let activeController: HomeControllerState | null = null;

const escapeFragmentId = (value: string) => {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
};

const getStaticHomeFragmentCard = (
  fragmentId: string,
  root: ParentNode = document,
) =>
  root.querySelector<HTMLElement>(
    `[${STATIC_FRAGMENT_CARD_ATTR}][data-fragment-id="${escapeFragmentId(
      fragmentId,
    )}"]`,
  );

const readStaticHomeHeightHint = (card: HTMLElement) => {
  const hintedHeight = Number.parseFloat(
    card.getAttribute("data-fragment-height-hint") ??
      card.style.getPropertyValue("--fragment-min-height"),
  );
  return Number.isFinite(hintedHeight) && hintedHeight > 0
    ? Math.ceil(hintedHeight)
    : null;
};

const resolveStaticHomeViewportWidth = (viewportWidth?: number | null) => {
  const normalizedWidth =
    typeof viewportWidth === "number" && Number.isFinite(viewportWidth)
      ? Math.max(0, Math.round(viewportWidth))
      : typeof window !== "undefined" &&
          typeof window.innerWidth === "number" &&
          window.innerWidth > 0
        ? Math.round(window.innerWidth)
        : HOME_LAYOUT_MAX_WIDTH;
  return normalizedWidth;
};

export const resolveStaticHomeEstimatedCardWidth = (viewportWidth?: number | null) => {
  const normalizedWidth = resolveStaticHomeViewportWidth(viewportWidth);
  const shellWidth = Math.min(normalizedWidth, HOME_LAYOUT_MAX_WIDTH);
  const horizontalPadding =
    normalizedWidth >= HOME_LAYOUT_SM_BREAKPOINT
      ? HOME_LAYOUT_SM_PADDING
      : HOME_LAYOUT_BASE_PADDING;
  const innerWidth = Math.max(0, shellWidth - horizontalPadding);
  if (normalizedWidth < HOME_LAYOUT_TWO_COLUMN_BREAKPOINT) {
    return innerWidth > 0 ? innerWidth : null;
  }
  const columnWidth = Math.floor((innerWidth - HOME_LAYOUT_GAP) / 2);
  return columnWidth > 0 ? columnWidth : null;
};

export const readStaticHomeWidthBucketHint = (
  card: HTMLElement,
  viewportWidth?: number | null,
) => {
  const normalizedWidth = resolveStaticHomeViewportWidth(viewportWidth);
  const mobileHint = card.getAttribute(STATIC_FRAGMENT_WIDTH_BUCKET_MOBILE_ATTR);
  const desktopHint = card.getAttribute(STATIC_FRAGMENT_WIDTH_BUCKET_ATTR);
  const hintedBucket =
    normalizedWidth < HOME_LAYOUT_TWO_COLUMN_BREAKPOINT
      ? mobileHint ?? desktopHint
      : desktopHint ?? mobileHint;
  if (hintedBucket) {
    return hintedBucket;
  }

  const layout = parseFragmentHeightLayout(
    card.getAttribute("data-fragment-height-layout"),
  );
  if (!layout) {
    return null;
  }

  return (
    resolveFragmentHeightWidthBucket({
      layout,
      viewport: getFragmentHeightViewport(normalizedWidth),
      cardWidth: resolveStaticHomeEstimatedCardWidth(normalizedWidth),
    }) ?? null
  );
};

export const collectStaticHomeSizingSeeds = (
  fragmentOrder: string[],
  viewportWidth?: number | null,
  root: ParentNode = document,
): FragmentRuntimeSizingMap =>
  fragmentOrder.reduce<FragmentRuntimeSizingMap>((acc, fragmentId) => {
    const card = getStaticHomeFragmentCard(fragmentId, root);
    if (!card) return acc;
    const stableHeight = readStaticHomeHeightHint(card);
    const widthBucket = readStaticHomeWidthBucketHint(card, viewportWidth);
    if (stableHeight === null && widthBucket === null) {
      return acc;
    }
    acc[fragmentId] = {
      stableHeight,
      widthBucket,
    };
    return acc;
  }, {});

const applySharedHomeRuntimeSizing = (
  sizing: FragmentRuntimeCardSizing,
  root: ParentNode = document,
) => {
  const card = getStaticHomeFragmentCard(sizing.fragmentId, root);
  if (!card) return;
  if (sizing.reservedHeight > 0) {
    card.style.setProperty(
      "--fragment-min-height",
      `${sizing.reservedHeight}px`,
    );
    card.setAttribute("data-fragment-height-hint", `${sizing.reservedHeight}`);
  }
};

const connectSharedHomeRuntime = ({
  controller,
  root = document,
  runtimePlanEntries,
  runtimeFetchGroups,
  runtimeInitialFragments,
  fragmentOrder,
  fragmentBootstrapHref,
  onCommit,
}: {
  controller: Pick<
    HomeControllerState,
    "lang" | "path" | "cleanupFns"
  >;
  root?: ParentNode;
  runtimePlanEntries: FragmentRuntimePlanEntry[];
  runtimeFetchGroups: string[][];
  runtimeInitialFragments: FragmentPayload[];
  fragmentOrder: string[];
  fragmentBootstrapHref: string | null;
  onCommit: (payload: FragmentPayload) => void;
}): HomeSharedRuntimeConnection | null => {
  if (!runtimePlanEntries.length || typeof window === "undefined") {
    return null;
  }

  let didMarkFirstAnchorBatch = false;
  let pendingAnchorIds = new Set<string>();
  const planEntriesById = new Map(
    runtimePlanEntries.map((entry) => [entry.id, entry]),
  );
  const reportedWidths = new Map<string, number | null>();
  const reportedWidthBuckets = new Map<string, string | null>();
  const ignoredInitialResizeById = new Set<string>();
  const viewportWidth =
    typeof window.innerWidth === "number" && window.innerWidth > 0
      ? window.innerWidth
      : 1280;
  const initialSizing = collectStaticHomeSizingSeeds(
    fragmentOrder,
    viewportWidth,
    root,
  );
  Object.entries(initialSizing).forEach(([fragmentId, seed]) => {
    reportedWidthBuckets.set(fragmentId, seed.widthBucket ?? null);
  });

  const sharedRuntime = ensureHomeSharedRuntime(
    {
      path: controller.path,
      lang: controller.lang,
      planEntries: runtimePlanEntries,
      fetchGroups: runtimeFetchGroups,
      initialFragments: runtimeInitialFragments,
      initialSizing,
      knownVersions: collectStaticHomeKnownVersions(root),
      visibleIds: [],
      viewportWidth,
      enableStreaming: false,
      startupMode: "visible-only",
      bootstrapHref: fragmentBootstrapHref,
    },
    window,
  );

  if (!sharedRuntime) {
    return null;
  }

  sharedRuntime.attachHandlers({
    onCommit: (payload) => {
      if (!didMarkFirstAnchorBatch && pendingAnchorIds.has(payload.id)) {
        didMarkFirstAnchorBatch = true;
        pendingAnchorIds.clear();
        markStaticShellUserTiming("prom:home:first-anchor-batch-fetched");
      }
      onCommit(payload);
    },
    onSizing: (sizing) => {
      applySharedHomeRuntimeSizing(sizing, root);
    },
    onStatus: (status) => {
      updateFragmentStatus(
        controller.lang,
        status === "idle" ? "idle" : "streaming",
      );
    },
    onError: (message) => {
      console.error("Static home shared runtime failed:", message);
      updateFragmentStatus(controller.lang, "error");
    },
  });

  const handleStableHeight = (event: Event) => {
    const detail = (
      event as CustomEvent<{ fragmentId?: string; height?: number }>
    ).detail;
    const fragmentId = detail?.fragmentId?.trim();
    if (!fragmentId || typeof detail.height !== "number") return;
    const card = getStaticHomeFragmentCard(fragmentId, root);
    if (!card) return;
    const width = reportedWidths.get(fragmentId) ?? null;
    sharedRuntime.measureCard(
      fragmentId,
      Math.ceil(detail.height),
      width,
      card.dataset.fragmentReady === "true",
    );
  };

  document.addEventListener(
    "prom:fragment-stable-height",
    handleStableHeight as EventListener,
  );
  controller.cleanupFns.push(() =>
    document.removeEventListener(
      "prom:fragment-stable-height",
      handleStableHeight as EventListener,
    ),
  );

  if (typeof ResizeObserver === "function") {
    const installResizeObserver = () => {
      const resizeObserver = new ResizeObserver((entries) => {
        entries.forEach((entry) => {
          const card = entry.target as HTMLElement;
          const fragmentId = card.dataset.fragmentId;
          if (!fragmentId) return;

          const width =
            typeof entry.contentRect?.width === "number" &&
            Number.isFinite(entry.contentRect.width) &&
            entry.contentRect.width > 0
              ? Math.ceil(entry.contentRect.width)
              : null;
          const previousWidth = reportedWidths.get(fragmentId) ?? null;
          if (width !== null) {
            reportedWidths.set(fragmentId, width);
          }

          const layout = planEntriesById.get(fragmentId)?.layout;
          const nextWidthBucket =
            width !== null && layout
              ? resolveFragmentHeightWidthBucket({
                  layout,
                  viewport: getFragmentHeightViewport(width),
                  cardWidth: width,
                }) ?? null
              : reportedWidthBuckets.get(fragmentId) ?? null;
          const previousWidthBucket =
            reportedWidthBuckets.get(fragmentId) ?? null;
          reportedWidthBuckets.set(fragmentId, nextWidthBucket);

          if (!ignoredInitialResizeById.has(fragmentId)) {
            ignoredInitialResizeById.add(fragmentId);
            return;
          }

          if (width === null || nextWidthBucket === previousWidthBucket) {
            return;
          }
          if (previousWidth === width) {
            return;
          }

          sharedRuntime.reportCardWidth(fragmentId, width);
          if (card.dataset.fragmentReady === "true") {
            sharedRuntime.measureCard(
              fragmentId,
              Math.ceil(entry.contentRect.height),
              width,
              true,
            );
          }
        });
      });

      fragmentOrder.forEach((fragmentId) => {
        const card = getStaticHomeFragmentCard(fragmentId, root);
        if (card) {
          resizeObserver.observe(card);
        }
      });

      return () => resizeObserver.disconnect();
    };

    let resizeObserverCleanup: (() => void) | null = null;
    controller.cleanupFns.push(() => resizeObserverCleanup?.());
    controller.cleanupFns.push(
      scheduleStaticShellTask(() => {
        resizeObserverCleanup = installResizeObserver();
      }, {
        priority: "background",
        timeoutMs: 1200,
        waitForPaint: true,
      }),
    );
  }

  controller.cleanupFns.push(() => {
    sharedRuntime.detachHandlers();
    sharedRuntime.dispose();
  });

  return {
    async requestFragments(ids, { isAnchorBatch }) {
      if (!ids.length) return;
      sharedRuntime.resumeAfterPageShow();
      if (isAnchorBatch && !didMarkFirstAnchorBatch) {
        pendingAnchorIds = new Set(ids);
      }
      sharedRuntime.requestFragments(ids, {
        priority: isAnchorBatch ? "critical" : "visible",
      });
    },
    suspendForPageHide() {
      sharedRuntime.suspendForPageHide();
    },
    resumeAfterPageShow() {
      return sharedRuntime.resumeAfterPageShow();
    },
  };
};

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
  return scheduleStaticRoutePaintReady({
    root: staticHomeRoot,
    readyAttr: STATIC_HOME_PAINT_ATTR,
    requestFrame,
    cancelFrame,
    setTimer,
    clearTimer,
    onReady,
  });
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
  requestFragments?: (
    ids: string[],
    options: HomeSharedRuntimeRequestOptions,
  ) => Promise<void>;
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
const HOME_POST_LCP_RUNTIME_INTENT_EVENTS = [
  "pointerdown",
  "touchstart",
  "keydown",
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
  requestFragments,
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
                return;
              }

              visibleDeferredIds.add(id);
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

  const hasBufferedHomePayload = (fragmentId: string) =>
    controller.patchQueue?.hasBuffered?.(fragmentId) ?? false;

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
          card.getAttribute(STATIC_HOME_PATCH_STATE_ATTR) === "pending" &&
          hasBufferedHomePayload(id)
        ) {
          return false;
        }
        if (
          card.getAttribute(STATIC_HOME_PATCH_STATE_ATTR) !== "pending" &&
          (!previewRefreshesEnabled || !isRefreshableHomeFragmentCard(card))
        ) {
          return false;
        }
        return true;
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
      if (requestFragments) {
        await requestFragments(ids, {
          isAnchorBatch,
        });
        if (
          controller.destroyed ||
          controller.fetchAbort !== fetchAbort ||
          fetchAbort.signal.aborted
        ) {
          return;
        }
        controller.fetchAbort = null;
        return;
      }

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
            timeoutMs: 0,
            waitForPaint: true,
            preferIdle: false,
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
          if (
            card.getAttribute(STATIC_HOME_PATCH_STATE_ATTR) === "pending" ||
            (previewRefreshesEnabled && isRefreshableHomeFragmentCard(card))
          ) {
            queuedDeferredIds.add(id);
          }
          if (!observer) {
            visibleDeferredIds.add(id);
            controller.patchQueue?.setVisible(id, true);
            scheduleNextHydration();
            return;
          }

          if (observedDeferredCards.has(card)) return;
          observedDeferredCards.add(card);
          observer.observe(card);
        });
      scheduleNextHydration();
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
  controller.sharedRuntime = null;
  controller.homeFragmentHydration = null;
  controller.deferredRuntimeCleanup = null;
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

  return () => {
    cleanupTriggers();
    runtimeCleanup?.();
    runtimeCleanup = null;
  };
};

const hasStaticHomeVersionMismatch = (
  controller: Pick<HomeControllerState, "fragmentOrder">,
  knownVersions: Record<string, number>,
) =>
  controller.fragmentOrder.some((fragmentId) => {
    const renderedVersion = collectStaticHomeKnownVersions(document)[fragmentId];
    const nextVersion = knownVersions[fragmentId];
    return typeof renderedVersion === "number" &&
      typeof nextVersion === "number" &&
      renderedVersion !== nextVersion;
  });

export const installHomeBootstrapDeferredRuntime = async () => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const controller = activeController;
  if (!controller || controller.destroyed || controller.deferredRuntimeCleanup) {
    return;
  }

  const data = readStaticHomeBootstrapData();
  if (!data) {
    return;
  }

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

  const routeSeed = await resolveStaticHomeRouteSeed(data);
  if (controller !== activeController || controller.destroyed) {
    return;
  }
  applyShellLanguageSeed(data.lang, data.shellSeed, routeSeed);

  const homeFragmentHydration = controller.homeFragmentHydration;
  if (!homeFragmentHydration) {
    return;
  }

  homeFragmentHydration.observeWithin(document);
  if (hasStaticHomeVersionMismatch(controller, data.fragmentVersions)) {
    homeFragmentHydration.schedulePreviewRefreshes();
    homeFragmentHydration.retryPending();
  }

  const postLcpCleanup = installDeferredHomePostLcpRuntime({
    controller,
    homeFragmentHydration,
  });
  const handlePageHide = () => {
    stopHomeHydrationFetches(controller);
    controller.sharedRuntime?.suspendForPageHide();
  };

  const handlePageShow = (event: PageTransitionEvent) => {
    if (!event.persisted || controller.destroyed) return;
    controller.sharedRuntime?.resumeAfterPageShow();
    updateFragmentStatus(controller.lang, "idle");
    homeFragmentHydration.observeWithin(document);
    homeFragmentHydration.retryPending();
    requestHomeDemoObserve();
  };

  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("pageshow", handlePageShow);

  const cleanupDeferredRuntime = () => {
    window.removeEventListener("pagehide", handlePageHide);
    window.removeEventListener("pageshow", handlePageShow);
    postLcpCleanup();
    if (controller.deferredRuntimeCleanup === cleanupDeferredRuntime) {
      controller.deferredRuntimeCleanup = null;
    }
  };

  controller.deferredRuntimeCleanup = cleanupDeferredRuntime;
  controller.cleanupFns.push(cleanupDeferredRuntime);
};

export const bootstrapStaticHomeAnchor = async () => {
  const data = readStaticHomeBootstrapData();
  if (!data) return;
  primeTrustedTypesPolicies();
  cleanupLegacyHomePersistence();
  const routeSeed = await resolveStaticHomeRouteSeed(data);
  applyShellLanguageSeed(data.lang, data.shellSeed, routeSeed);
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
    sharedRuntime: null,
    homeFragmentHydration: null,
    deferredRuntimeCleanup: null,
    destroyed: false,
  };
  activeController = controller;

  controller.patchQueue = createStaticHomePatchQueue({
    lang: controller.lang,
    visibleFirst: true,
    bufferDeferredUntilRelease: true,
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
  const handleDeferredCommitRelease = () => {
    controller.patchQueue?.releaseDeferred();
  };
  document.addEventListener(
    HOME_DEFERRED_COMMIT_RELEASE_EVENT,
    handleDeferredCommitRelease,
  );
  controller.cleanupFns.push(() =>
    document.removeEventListener(
      HOME_DEFERRED_COMMIT_RELEASE_EVENT,
      handleDeferredCommitRelease,
    ),
  );
  const sharedRuntime = connectSharedHomeRuntime({
    controller,
    runtimePlanEntries: data.runtimePlanEntries,
    runtimeFetchGroups: data.runtimeFetchGroups,
    runtimeInitialFragments: data.runtimeInitialFragments,
    fragmentOrder: data.fragmentOrder,
    fragmentBootstrapHref: data.fragmentBootstrapHref,
    onCommit: (payload) => {
      controller.patchQueue?.enqueue(payload);
    },
  });
  controller.sharedRuntime = sharedRuntime;
  const homeFragmentHydration = bindHomeFragmentHydration({
    controller,
    requestFragments: sharedRuntime?.requestFragments,
  });
  controller.homeFragmentHydration = homeFragmentHydration;
  controller.cleanupFns.push(() => homeFragmentHydration.destroy());
  let didScheduleInitialAnchorHydration = false;
  const scheduleInitialAnchorHydration = () => {
    if (
      didScheduleInitialAnchorHydration ||
      controller.destroyed ||
      document.visibilityState === "hidden"
    ) {
      return;
    }
    didScheduleInitialAnchorHydration = true;
    homeFragmentHydration.scheduleAnchorHydration();
  };
  scheduleInitialAnchorHydration();
  controller.cleanupFns.push(
    scheduleStaticHomePaintReady({
      onReady: scheduleInitialAnchorHydration,
    }),
  );
  updateFragmentStatus(controller.lang, "idle");
};

export const bootstrapStaticHome = async () => {
  await bootstrapStaticHomeAnchor();
  await installHomeBootstrapDeferredRuntime();
};
